import os
import inspect
import logging
from typing import List, Optional
from fastapi import FastAPI, UploadFile, File, Query, HTTPException
from pydantic import BaseModel
import pypdf
import docx2txt

from dotenv import load_dotenv
# Load parent directory's .env file
load_dotenv(dotenv_path="../.env")

from lightrag import LightRAG, QueryParam
from lightrag.llm.openai import openai_complete_if_cache, openai_embed
from lightrag.utils import setup_logger, EmbeddingFunc

# Initialize logging
setup_logger("lightrag", level="INFO")
logger = logging.getLogger("lightrag-service")

app = FastAPI(title="LightRAG Multi-Tenant Service", version="1.0.0")

# Cache RAG instances per workspace to avoid re-instantiating storage repeatedly
instances = {}

# ── LLM Config: Google Gemini ───────────────────────────────────
# Google Gemini para generación de texto a través del endpoint compatible con OpenAI
gemini_key = os.getenv("GEMINI_API_KEY", "")
os.environ["OPENAI_API_KEY"] = gemini_key
os.environ.setdefault("OPENAI_BASE_URL", "https://generativelanguage.googleapis.com/v1beta/openai/")
os.environ.setdefault("LLM_MODEL", "gemini-1.5-flash")

# ── Embedding Config: Google Gemini ───────────────────────────
# Google Gemini para embeddings (gemini-embedding-001, 768 dims, gratis)
gemini_key = os.getenv("GEMINI_API_KEY", "")
GEMINI_EMBED_MODEL = "gemini-embedding-001"
GEMINI_EMBED_DIM = 3072
GEMINI_EMBED_BASE = "https://generativelanguage.googleapis.com/v1beta"

logger.info(f"LLM: Gemini ({os.getenv('LLM_MODEL', 'gemini-1.5-flash')})")
logger.info(f"Embeddings: Google Gemini ({GEMINI_EMBED_MODEL}, {GEMINI_EMBED_DIM}d)")

# Custom LLM function — Gemini via OpenAI-compatible API
async def custom_llm_model_func(
    prompt, system_prompt=None, history_messages=[], **kwargs
) -> str:
    # Force Gemini 1.5 Flash to avoid Groq rate limits
    model_name = os.getenv("LLM_MODEL", "gemini-1.5-flash")
    api_key = os.getenv("OPENAI_API_KEY")
    base_url = os.getenv("OPENAI_BASE_URL", "https://generativelanguage.googleapis.com/v1beta/openai/")
    
    logger.info(f"Calling LLM: {model_name}")
    
    return await openai_complete_if_cache(
        model_name,
        prompt,
        system_prompt=system_prompt,
        history_messages=history_messages,
        api_key=api_key,
        base_url=base_url,
        **kwargs,
    )

# Custom Embedding function — Google Gemini native API
async def custom_embedding_func(texts: list[str]) -> list[list[float]]:
    import requests as req
    import numpy as np
    logger.info(f"Calling Gemini Embedding: {GEMINI_EMBED_MODEL} ({len(texts)} texts)")
    
    url = f"{GEMINI_EMBED_BASE}/models/{GEMINI_EMBED_MODEL}:batchEmbedContents?key={gemini_key}"
    
    # Build batch request
    requests_body = []
    for text in texts:
        requests_body.append({
            "model": f"models/{GEMINI_EMBED_MODEL}",
            "content": {"parts": [{"text": text}]}
        })
    
    resp = req.post(url, json={"requests": requests_body}, timeout=30)
    if resp.status_code != 200:
        logger.error(f"Gemini Embedding failed ({resp.status_code}): {resp.text}")
        raise Exception(f"Gemini Embedding API error: {resp.text}")
    
    data = resp.json()
    embeddings = [item["values"] for item in data["embeddings"]]
    return np.array(embeddings)

async def get_rag_instance(workspace: str) -> LightRAG:
    if not workspace:
        raise HTTPException(status_code=400, detail="workspace parameter is required")
        
    # Clean the workspace name to prevent directory traversal
    workspace = "".join(c for c in workspace if c.isalnum() or c in ("-", "_"))
    if not workspace:
        raise HTTPException(status_code=400, detail="Invalid workspace name")
        
    if workspace not in instances:
        working_dir = os.path.join("./rag_storage", workspace)
        os.makedirs(working_dir, exist_ok=True)
        
        logger.info(f"Initializing LightRAG instance for workspace: {workspace} in {working_dir}")
        
        # Instantiate LightRAG
        rag = LightRAG(
            working_dir=working_dir,
            workspace=workspace,
            llm_model_func=custom_llm_model_func,
            embedding_func=EmbeddingFunc(
                embedding_dim=GEMINI_EMBED_DIM,
                max_token_size=8192,
                func=custom_embedding_func,
            ),
        )
        
        # Initialize storage asynchronously
        await rag.initialize_storages()
        instances[workspace] = rag
        
    return instances[workspace]

# Pydantic models for request bodies
class QueryRequest(BaseModel):
    query: str
    mode: Optional[str] = "hybrid"  # local, global, hybrid, naive

@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "llm_model": os.getenv("LLM_MODEL", "gpt-4o-mini"),
        "embedding_model": os.getenv("EMBEDDING_MODEL", "text-embedding-3-small"),
        "active_workspaces": list(instances.keys())
    }

@app.post("/upload")
async def upload_document(
    workspace: str = Query(...),
    doc_id: str = Query(...),
    file: UploadFile = File(...)
):
    try:
        filename = file.filename
        content = await file.read()
        text_content = ""
        
        # Parse file based on extension
        ext = os.path.splitext(filename)[1].lower()
        
        if ext == ".pdf":
            logger.info(f"Parsing PDF document: {filename} for workspace {workspace}")
            import io
            pdf_reader = pypdf.PdfReader(io.BytesIO(content))
            pages = []
            for i, page in enumerate(pdf_reader.pages):
                page_text = page.extract_text()
                if page_text:
                    pages.append(page_text)
            text_content = "\n\n".join(pages)
            
        elif ext in (".docx", ".doc"):
            logger.info(f"Parsing Word document: {filename} for workspace {workspace}")
            import io
            # docx2txt processes raw bytes or file-like objects
            text_content = docx2txt.process(io.BytesIO(content))
            
        elif ext in (".txt", ".md", ".json", ".csv"):
            logger.info(f"Parsing text document: {filename} for workspace {workspace}")
            text_content = content.decode("utf-8", errors="ignore")
            
        else:
            raise HTTPException(
                status_code=400,
                detail=f"Unsupported file type '{ext}'. Supported: PDF, DOCX, TXT, MD"
            )
            
        if not text_content.strip():
            raise HTTPException(
                status_code=400,
                detail="Extracted text is empty. Please verify the document content."
            )
            
        # Get dynamic workspace instance
        rag = await get_rag_instance(workspace)
        
        logger.info(f"Inserting document ID {doc_id} into LightRAG workspace {workspace}")
        # Insert with explicit doc_id as ids parameter for easy deletion
        await rag.ainsert(
            input=text_content,
            ids=[doc_id],
            file_paths=[filename]
        )
        
        return {
            "status": "success",
            "workspace": workspace,
            "doc_id": doc_id,
            "filename": filename,
            "characters_parsed": len(text_content)
        }
        
    except HTTPException as he:
        raise he
    except Exception as e:
        logger.exception("Error during document upload/indexing")
        raise HTTPException(status_code=500, detail=f"Indexing failed: {str(e)}")

@app.delete("/documents")
async def delete_document(
    workspace: str = Query(...),
    doc_id: str = Query(...)
):
    try:
        logger.info(f"Deleting document ID {doc_id} from LightRAG workspace {workspace}")
        rag = await get_rag_instance(workspace)
        
        # Check and use async adelete_by_doc_id if available, fallback to delete_by_doc_id
        if hasattr(rag, "adelete_by_doc_id"):
            await rag.adelete_by_doc_id(doc_id)
        elif hasattr(rag, "delete_by_doc_id"):
            res = getattr(rag, "delete_by_doc_id")(doc_id)
            if inspect.isawaitable(res):
                await res
        else:
            raise HTTPException(status_code=500, detail="No deletion method found on LightRAG instance")
            
        return {
            "status": "success",
            "workspace": workspace,
            "doc_id": doc_id
        }
    except Exception as e:
        logger.exception("Error during document deletion")
        raise HTTPException(status_code=500, detail=f"Deletion failed: {str(e)}")

@app.post("/query")
async def query_rag(
    workspace: str = Query(...),
    body: QueryRequest = ...
):
    try:
        logger.info(f"Querying LightRAG workspace {workspace} in mode {body.mode}")
        rag = await get_rag_instance(workspace)
        
        # Valid modes: local, global, hybrid, naive
        mode = body.mode if body.mode in ("local", "global", "hybrid", "naive") else "hybrid"
        
        # Query LightRAG
        response = await rag.aquery(body.query, param=QueryParam(mode=mode))
        
        return {
            "workspace": workspace,
            "response": response
        }
    except Exception as e:
        logger.exception("Error during query processing")
        raise HTTPException(status_code=500, detail=f"Query failed: {str(e)}")

# Get knowledge graph endpoint for visualization
@app.get("/graph")
async def get_graph(
    workspace: str = Query(...),
    label: str = Query("*"),
    max_depth: int = Query(3),
    max_nodes: int = Query(1000)
):
    try:
        logger.info(f"Retrieving knowledge graph for workspace {workspace}, label {label}")
        rag = await get_rag_instance(workspace)
        graph_data = await rag.get_knowledge_graph(
            node_label=label,
            max_depth=max_depth,
            max_nodes=max_nodes
        )
        return graph_data
    except Exception as e:
        logger.exception("Error retrieving knowledge graph")
        raise HTTPException(status_code=500, detail=f"Failed to get graph: {str(e)}")

class InsertTextRequest(BaseModel):
    text: str

# Insert raw text endpoint for dynamic learning
@app.post("/insert-text")
async def insert_text(
    workspace: str = Query(...),
    body: InsertTextRequest = ...
):
    try:
        if not body.text.strip():
            raise HTTPException(status_code=400, detail="Text cannot be empty")
            
        logger.info(f"Inserting raw text into LightRAG workspace {workspace}")
        rag = await get_rag_instance(workspace)
        
        import hashlib
        import time
        doc_id = f"mem_{int(time.time())}_{hashlib.md5(body.text.encode('utf-8')).hexdigest()[:8]}"
        
        await rag.ainsert(
            input=body.text,
            ids=[doc_id]
        )
        
        return {
            "status": "success",
            "workspace": workspace,
            "doc_id": doc_id,
            "characters_inserted": len(body.text)
        }
    except Exception as e:
        logger.exception("Error during text insertion")
        raise HTTPException(status_code=500, detail=f"Insertion failed: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=9621, reload=False)
