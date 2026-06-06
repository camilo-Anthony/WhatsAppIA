'use client'

import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls, Html } from '@react-three/drei'
import { useRef, useState, useMemo, useCallback, useEffect, Suspense, memo } from 'react'
import * as THREE from 'three'

// ═══════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════

export type GraphPropertyValue = string | number | boolean | null | undefined

export interface GraphNode {
    id: string
    labels?: string[]
    properties?: Record<string, GraphPropertyValue>
}

export interface GraphEdge {
    id?: string
    source: string
    target: string
    type?: string
    properties?: Record<string, GraphPropertyValue>
}

interface Brain3DGraphProps {
    nodes: GraphNode[]
    edges: GraphEdge[]
    searchQuery: string
    activeNodeId?: string | null
    onNodeClick: (node: GraphNode) => void
}

type BrainChamberKey = 'identidad' | 'conocimiento' | 'herramientas' | 'memoria'

interface BrainChamber {
    key: BrainChamberKey
    title: string
    shortTitle: string
    position: [number, number, number]
    corePosition: [number, number, number]
    scale: [number, number, number]
    color: number
    match: (label: string) => boolean
}

// ═══════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════

const BRAIN_CHAMBERS: BrainChamber[] = [
    {
        key: 'identidad', title: 'Identidad', shortTitle: 'Identidad',
        position: [0, 0.58, 0.18], corePosition: [0, 0.35, 0.4],
        scale: [0.72, 0.42, 0.62], color: 0xb026ff, // Neon Purple
        match: (l) => l.includes('IDENTIDAD') || l.includes('ESTUDIO'),
    },
    {
        key: 'conocimiento', title: 'Conocimiento indexado', shortTitle: 'Conocimiento',
        position: [-0.78, 0.0, 0.12], corePosition: [-0.38, 0.25, -0.25],
        scale: [0.64, 0.58, 0.58], color: 0x06b6d4, // Cyan
        match: (l) => l.includes('CONOCIMIENTO') || l.includes('BASE_CONOCIMIENTO') || l.includes('DOCUMENTO') || l.includes('RAG'),
    },
    {
        key: 'herramientas', title: 'Herramientas', shortTitle: 'Herramientas',
        position: [0.78, 0.0, 0.12], corePosition: [0.38, 0.25, -0.25],
        scale: [0.64, 0.58, 0.58], color: 0xf43f5e, // Coral/Pink
        match: (l) => l.includes('HERRAMIENTA') || l.includes('CAJA_HERRAMIENTAS'),
    },
    {
        key: 'memoria', title: 'Memoria viva', shortTitle: 'Memoria',
        position: [0, -0.85, 0.2], corePosition: [0, -0.45, 0.1],
        scale: [0.95, 0.45, 0.85], color: 0x84cc16, // Acid Lime
        match: (l) =>
            l.includes('MEMORIA') || l.includes('CLIENTE') || l.includes('PERSONA') ||
            l.includes('CONTACTO') || l.includes('ORGANIZA') || l.includes('UBICACI') ||
            l.includes('PREFERENCIA') || l.includes('DATO'),
    },
]

// ═══════════════════════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════════════════════

function getPrimaryLabel(n: GraphNode): string { return (n.labels?.[0] || '').toUpperCase() }
function getChamberForNode(n: GraphNode): BrainChamber {
    const l = getPrimaryLabel(n); return BRAIN_CHAMBERS.find((c) => c.match(l)) || BRAIN_CHAMBERS[3]
}
function getChamberStats(nodes: GraphNode[]): Record<BrainChamberKey, number> {
    return nodes.reduce<Record<BrainChamberKey, number>>(
        (s, n) => { s[getChamberForNode(n).key] += 1; return s },
        { identidad: 0, conocimiento: 0, herramientas: 0, memoria: 0 }
    )
}
function getDisplayName(n: GraphNode): string { return String(n.properties?.displayName || n.id) }
function hexColor(n: number): string { return `#${n.toString(16).padStart(6, '0')}` }
function isSameChamberEdge(edge: GraphEdge, nodeById: Map<string, GraphNode>): boolean {
    if (edge.type === 'CORE_LINK') return true
    const source = nodeById.get(edge.source)
    const target = nodeById.get(edge.target)
    if (!source || !target) return false
    return getChamberForNode(source).key === getChamberForNode(target).key
}
function seededRandom(seed: number): () => number {
    let s = seed || 1; return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646 }
}
function hashString(str: string): number {
    let h = 5381; for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0; return Math.abs(h)
}

// ═══════════════════════════════════════════════════════════
// 3D BRAIN GEOMETRY — full volumetric, not cross-section
// ═══════════════════════════════════════════════════════════

function createChamberGeometry(
    xMin: number, xMax: number,
    yMin: number, yMax: number,
    zMin: number, zMax: number,
    colorHex: number,
    segs: number = 24
): THREE.BufferGeometry {
    const w = xMax - xMin, h = yMax - yMin, d = zMax - zMin
    const geo = new THREE.BoxGeometry(w, h, d, Math.ceil(w * segs), Math.ceil(h * segs), Math.ceil(d * segs))
    geo.translate(xMin + w / 2, yMin + h / 2, zMin + d / 2)

    const pos = geo.attributes.position
    const cx = (xMin + xMax) / 2, cy = (yMin + yMax) / 2, cz = (zMin + zMax) / 2

    for (let i = 0; i < pos.count; i++) {
        let x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i)

        // Shrink slightly to create physical separation walls between chambers (glow seams)
        x = cx + (x - cx) * 0.98
        y = cy + (y - cy) * 0.98
        z = cz + (z - cz) * 0.98

        // Cube to Sphere mapping
        const x2 = x * x, y2 = y * y, z2 = z * z
        const sx = x * Math.sqrt(1 - y2 / 2 - z2 / 2 + (y2 * z2) / 3)
        const sy = y * Math.sqrt(1 - x2 / 2 - z2 / 2 + (x2 * z2) / 3)
        const sz = z * Math.sqrt(1 - x2 / 2 - y2 / 2 + (x2 * y2) / 3)

        // Deform to the EXACT original Brain shape that was approved
        let bx = sx;
        let by = sy;
        let bz = -sz; // Flip Z to match the old coordinate space where -z was front

        const side = bx < 0 ? -1 : 1;

        // Old brain proportions
        bx *= 0.92; by *= 0.96; bz *= 1.08;

        // Flatten medial surface (sagittal fissure)
        const medial = bx * side;
        if (medial < 0.12) {
            const c = medial < 0 ? 0.12 : 0.12 + (medial / 0.12) * 0.88;
            bx = side * 0.02 + (bx - side * 0.02) * c;
        }
        bx += side * 0.12;

        // Frontal lobe narrowing & slight downward tilt
        const zn = bz / 1.08;
        if (zn < 0) {
            const f = -zn;
            bx *= 1 - f * 0.24;
            by *= 1 - f * 0.08;
            by -= f * f * 0.1;
        }

        // Occipital rounding
        if (zn > 0.3) {
            const b = (zn - 0.3) / 0.7;
            bx *= 1 - b * 0.1;
        }

        // Temporal lobe bulge (lower front-sides)
        const yn = by / 0.96;
        if (yn < -0.18 && zn < 0.2) {
            const t = Math.max(0, -yn - 0.18) * Math.max(0, 0.2 - zn) * 2.8;
            bx *= 1 + t * 0.45;
            by -= t * 0.07;
            bz -= t * 0.04;
        }

        // Top flattening
        if (by > 0.72) by = 0.72 + (by - 0.72) * 0.38;

        // Sulci wrinkles (surface displacement)
        const r = Math.sqrt(bx * bx + by * by + bz * bz);
        if (r > 0.1) {
            const s = Math.sin(by * 17 + bz * 5.5) * Math.cos(bx * side * 13) * 0.016
                + Math.sin(by * 24 + bx * side * 19 + bz * 11) * 0.009;
            bx += (bx / r) * s;
            by += (by / r) * s;
            bz += (bz / r) * s;
        }

        bz = -bz; // Restore Z (+z is front)

        pos.setXYZ(i, bx, by, bz)
    }
    geo.computeVertexNormals()
    paintUniformColor(geo, colorHex)
    return geo
}

function paintUniformColor(geo: THREE.BufferGeometry, hex: number): void {
    const c = new THREE.Color(hex)
    const pos = geo.attributes.position
    const colors = new Float32Array(pos.count * 3)
    for (let i = 0; i < pos.count; i++) {
        colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
}

// ═══════════════════════════════════════════════════════════
// HOLOGRAM SHADER
// ═══════════════════════════════════════════════════════════

const HOLO_VERT = /* glsl */ `
attribute vec3 color;
varying vec3 vNormal;
varying vec3 vWorldPos;
varying vec3 vCol;

void main() {
    vNormal = normalize(normalMatrix * normal);
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorldPos = wp.xyz;
    vCol = color;
    gl_Position = projectionMatrix * viewMatrix * wp;
}
`

const HOLO_FRAG = /* glsl */ `
uniform float uTime;
uniform float uAlpha;
varying vec3  vNormal;
varying vec3  vWorldPos;
varying vec3  vCol;

void main() {
    vec3 viewDir = normalize(cameraPosition - vWorldPos);
    float fresnel = pow(1.0 - abs(dot(viewDir, vNormal)), 2.8);

    // Softened, slower scanlines (reduced noise)
    float scan = sin(vWorldPos.y * 30.0 - uTime * 1.0) * 0.5 + 0.5;
    scan = smoothstep(0.4, 0.6, scan) * 0.1;

    // Smooth pulsing flicker
    float flicker = 0.96 + 0.04 * sin(uTime * 4.0);

    vec3 col = vCol * (0.15 + fresnel * 0.85) * flicker;
    col += vCol * scan * 0.15;
    col += vec3(0.04, 0.0, 0.08) * fresnel * 0.15;

    // Clean transparency with just fresnel and scan
    float a = (0.05 + fresnel * 0.35 + scan * 0.3) * uAlpha * flicker;

    gl_FragColor = vec4(col, a);
}
`

function createHologramMaterial(alpha = 1.0): THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({
        uniforms: {
            uTime: { value: 0 },
            uAlpha: { value: alpha },
        },
        vertexShader: HOLO_VERT,
        fragmentShader: HOLO_FRAG,
        transparent: true,
        side: THREE.DoubleSide,
        depthWrite: false,
    })
}

// ═══════════════════════════════════════════════════════════
// SYNAPSE EDGES
// ═══════════════════════════════════════════════════════════

function buildSynapseEdges(
    edges: GraphEdge[],
    nodeById: Map<string, GraphNode>,
    positions: Map<string, [number, number, number]>,
    visible: Set<string>,
    activeNodeId: string | null
): THREE.Group {
    const g = new THREE.Group(); g.name = 'obsidian-graph-edges'
    
    const activePts: number[] = []
    const radialPts: number[] = []
    const stdPts: number[] = []

    for (const edge of edges) {
        if (!isSameChamberEdge(edge, nodeById)) continue
        const sp = positions.get(edge.source), tp = positions.get(edge.target)
        if (!sp || !tp || !visible.has(edge.source) || !visible.has(edge.target)) continue
        
        if (edge.type === 'CORE_LINK') {
            const src = new THREE.Vector3(...sp), tgt = new THREE.Vector3(...tp)
            const path = new THREE.LineCurve3(src, tgt)
            const geometry = new THREE.TubeGeometry(path, 2, 0.006, 6, false)
            const material = new THREE.MeshBasicMaterial({
                color: 0xffffff, transparent: true, opacity: 0.65, blending: THREE.AdditiveBlending, depthWrite: false,
            })
            g.add(new THREE.Mesh(geometry, material))
            continue
        }

        const isActive = activeNodeId === edge.source || activeNodeId === edge.target
        const isRadial = edge.type === 'BRANCHES_TO'

        if (isActive) activePts.push(...sp, ...tp)
        else if (isRadial) radialPts.push(...sp, ...tp)
        else stdPts.push(...sp, ...tp)
    }

    // Batch all lines into 3 single draw calls using LineSegments
    if (activePts.length > 0) {
        const geo = new THREE.BufferGeometry()
        geo.setAttribute('position', new THREE.Float32BufferAttribute(activePts, 3))
        const mat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.82, depthWrite: false, blending: THREE.AdditiveBlending })
        g.add(new THREE.LineSegments(geo, mat))
    }
    if (radialPts.length > 0) {
        const geo = new THREE.BufferGeometry()
        geo.setAttribute('position', new THREE.Float32BufferAttribute(radialPts, 3))
        const mat = new THREE.LineBasicMaterial({ color: 0x6b7280, transparent: true, opacity: 0.16, depthWrite: false, blending: THREE.AdditiveBlending })
        g.add(new THREE.LineSegments(geo, mat))
    }
    if (stdPts.length > 0) {
        const geo = new THREE.BufferGeometry()
        geo.setAttribute('position', new THREE.Float32BufferAttribute(stdPts, 3))
        const mat = new THREE.LineBasicMaterial({ color: 0x9ca3af, transparent: true, opacity: 0.28, depthWrite: false, blending: THREE.AdditiveBlending })
        g.add(new THREE.LineSegments(geo, mat))
    }

    return g
}

// ═══════════════════════════════════════════════════════════
// FORCE-DIRECTED LAYOUT
// ═══════════════════════════════════════════════════════════

interface ChamberBox {
    center: [number, number, number]
    halfSize: [number, number, number]
}

function getChamberBox(key: BrainChamberKey): ChamberBox {
    if (key === 'identidad') {
        return { center: [0, 0.5, 0.6], halfSize: [0.8, 0.4, 0.28] }
    }
    if (key === 'conocimiento') {
        return { center: [-0.5, 0.5, -0.4], halfSize: [0.35, 0.4, 0.42] }
    }
    if (key === 'herramientas') {
        return { center: [0.5, 0.5, -0.4], halfSize: [0.35, 0.4, 0.42] }
    }
    // memoria
    return { center: [0, -0.5, 0], halfSize: [0.9, 0.35, 0.9] }
}

function deformPosition(x: number, y: number, z: number, key: BrainChamberKey): [number, number, number] {
    let cx = 0, cy = 0, cz = 0
    if (key === 'identidad') { cx = 0; cy = 0.5; cz = 0.6 }
    else if (key === 'conocimiento') { cx = -0.5; cy = 0.5; cz = -0.4 }
    else if (key === 'herramientas') { cx = 0.5; cy = 0.5; cz = -0.4 }
    else if (key === 'memoria') { cx = 0; cy = -0.5; cz = 0 }

    // Shrink slightly to create physical separation walls between chambers (glow seams)
    x = cx + (x - cx) * 0.98
    y = cy + (y - cy) * 0.98
    z = cz + (z - cz) * 0.98

    // Cube to Sphere mapping
    const x2 = x * x, y2 = y * y, z2 = z * z
    let sx = x * Math.sqrt(1 - y2 / 2 - z2 / 2 + (y2 * z2) / 3)
    let sy = y * Math.sqrt(1 - x2 / 2 - z2 / 2 + (x2 * z2) / 3)
    let sz = z * Math.sqrt(1 - x2 / 2 - y2 / 2 + (x2 * y2) / 3)

    // Deform to the EXACT original Brain shape that was approved
    let bx = sx
    let by = sy
    let bz = -sz // Flip Z to match the old coordinate space where -z was front

    const side = bx < 0 ? -1 : 1

    // Old brain proportions
    bx *= 0.92; by *= 0.96; bz *= 1.08

    // Flatten medial surface (sagittal fissure)
    const medial = bx * side
    if (medial < 0.12) {
        const c = medial < 0 ? 0.12 : 0.12 + (medial / 0.12) * 0.88
        bx = side * 0.02 + (bx - side * 0.02) * c
    }
    bx += side * 0.12

    // Frontal lobe narrowing & slight downward tilt
    const zn = bz / 1.08
    if (zn < 0) {
        const f = -zn
        bx *= 1 - f * 0.24
        by *= 1 - f * 0.08
        by -= f * f * 0.1
    }

    // Occipital rounding
    if (zn > 0.3) {
        const b = (zn - 0.3) / 0.7
        bx *= 1 - b * 0.1
    }

    // Temporal lobe bulge (lower front-sides)
    const yn = by / 0.96
    if (yn < -0.18 && zn < 0.2) {
        const t = Math.max(0, -yn - 0.18) * Math.max(0, 0.2 - zn) * 2.8
        bx *= 1 + t * 0.45
        by -= t * 0.07
        bz -= t * 0.04
    }

    // Top flattening
    if (by > 0.72) by = 0.72 + (by - 0.72) * 0.38

    // Sulci wrinkles (surface displacement)
    const r = Math.sqrt(bx * bx + by * by + bz * bz)
    if (r > 0.1) {
        const s = Math.sin(by * 17 + bz * 5.5) * Math.cos(bx * side * 13) * 0.016
            + Math.sin(by * 24 + bx * side * 19 + bz * 11) * 0.009
        bx += (bx / r) * s
        by += (by / r) * s
        bz += (bz / r) * s
    }

    bz = -bz // Restore Z (+z is front)

    return [bx, by, bz]
}

function computeForceLayout(
    nodes: GraphNode[], edges: GraphEdge[], memoryLoad: number
): Map<string, [number, number, number]> {
    if (nodes.length === 0) return new Map()
    interface FN { id: string; ch: BrainChamber; x: number; y: number; z: number; vx: number; vy: number; vz: number }
    
    // Group nodes by chamber to count them for spiral distribution
    const nodesByChamber: Record<BrainChamberKey, GraphNode[]> = {
        identidad: [], conocimiento: [], herramientas: [], memoria: []
    }
    nodes.forEach(node => {
        const ch = getChamberForNode(node)
        nodesByChamber[ch.key].push(node)
    })
    
    // Position index of each node within its chamber group
    const chamberNodeIndex = new Map<string, number>()
    Object.keys(nodesByChamber).forEach(k => {
        nodesByChamber[k as BrainChamberKey].forEach((node, idx) => {
            chamberNodeIndex.set(node.id, idx)
        })
    })

    const fn: FN[] = nodes.map((node) => {
        const ch = getChamberForNode(node)
        const box = getChamberBox(ch.key)
        const grow = ch.key === 'memoria' ? 1 + memoryLoad * 0.15 : 1
        const idxInCh = chamberNodeIndex.get(node.id) || 0
        const totalInCh = nodesByChamber[ch.key].length
        
        // Initial placement using spiral in box space
        const a = idxInCh * 2.39996 // Golden angle
        const r = totalInCh <= 1 ? 0 : 0.05 + 0.65 * Math.sqrt(idxInCh / totalInCh)
        
        return {
            id: node.id, ch,
            x: box.center[0] + Math.cos(a) * box.halfSize[0] * r * grow,
            y: box.center[1] + Math.sin(a) * box.halfSize[1] * r * grow,
            z: box.center[2] + Math.cos(a * 1.7) * box.halfSize[2] * r * grow,
            vx: 0, vy: 0, vz: 0,
        }
    })

    const idx = new Map(fn.map((n, i) => [n.id, i]))
    const nodeById = new Map(nodes.map((node) => [node.id, node]))

    for (let iter = 0; iter < 100; iter++) {
        const alpha = 0.3 * (1 - iter / 100)
        
        // Centering force
        for (const n of fn) {
            if (n.id.startsWith('core-')) continue 
            const box = getChamberBox(n.ch.key)
            n.vx += (box.center[0] - n.x) * 0.08 * alpha
            n.vy += (box.center[1] - n.y) * 0.08 * alpha
            n.vz += (box.center[2] - n.z) * 0.08 * alpha
        }
        
        // Repulsion force (intra-chamber only)
        for (let i = 0; i < fn.length; i++) {
            for (let j = i + 1; j < fn.length; j++) {
                if (fn[i].ch.key !== fn[j].ch.key) continue
                const a = fn[i], b = fn[j]
                let dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z
                let d2 = dx * dx + dy * dy + dz * dz
                if (d2 < 0.0001) {
                    dx = (Math.random() - 0.5) * 0.01
                    dy = (Math.random() - 0.5) * 0.01
                    dz = (Math.random() - 0.5) * 0.01
                    d2 = dx * dx + dy * dy + dz * dz
                }
                const d = Math.sqrt(d2)
                const f = Math.min(0.1, 0.006 * alpha / d2)
                a.vx += dx / d * f; a.vy += dy / d * f; a.vz += dz / d * f
                b.vx -= dx / d * f; b.vy -= dy / d * f; b.vz -= dz / d * f
            }
        }
        
        // Attraction force along edges
        for (const edge of edges) {
            if (!isSameChamberEdge(edge, nodeById)) continue
            const si = idx.get(edge.source), ti = idx.get(edge.target)
            if (si === undefined || ti === undefined) continue
            const a = fn[si], b = fn[ti]
            const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z
            const d = Math.max(0.001, Math.sqrt(dx * dx + dy * dy + dz * dz))
            const f = (d - 0.15) * 0.025 * alpha
            a.vx += dx / d * f; a.vy += dy / d * f; a.vz += dz / d * f
            b.vx -= dx / d * f; b.vy -= dy / d * f; b.vz -= dz / d * f
        }
        
        // Position update & strict bounding box clamping
        for (const n of fn) {
            if (n.id.startsWith('core-')) {
                const box = getChamberBox(n.ch.key)
                n.x = box.center[0]
                n.y = box.center[1]
                n.z = box.center[2]
                n.vx = 0; n.vy = 0; n.vz = 0
                continue
            }
            n.x += n.vx; n.y += n.vy; n.z += n.vz
            n.vx *= 0.5; n.vy *= 0.5; n.vz *= 0.5
            
            const box = getChamberBox(n.ch.key)
            const grow = n.ch.key === 'memoria' ? 1 + memoryLoad * 0.15 : 1
            const hx = box.halfSize[0] * grow * 0.95
            const hy = box.halfSize[1] * grow * 0.95
            const hz = box.halfSize[2] * grow * 0.95
            
            n.x = Math.max(box.center[0] - hx, Math.min(box.center[0] + hx, n.x))
            n.y = Math.max(box.center[1] - hy, Math.min(box.center[1] + hy, n.y))
            n.z = Math.max(box.center[2] - hz, Math.min(box.center[2] + hz, n.z))
        }
    }
    
    // Map the pre-deformed box coordinates to the actual 3D brain shape
    const result = new Map<string, [number, number, number]>()
    for (const n of fn) {
        const deformed = deformPosition(n.x, n.y, n.z, n.ch.key)
        result.set(n.id, deformed)
    }
    return result
}

// R3F COMPONENTS
// ═══════════════════════════════════════════════════════════

/** Full 3D holographic brain with animated shader */
function BrainAnatomy() {
    const brainRef = useRef<THREE.Group>(null!)
    const matsRef = useRef<THREE.ShaderMaterial[]>([])

    // The 4 mathematical geometric blocks for the chambers
    const geoIdentidad = useMemo(() => createChamberGeometry(-1, 1, 0, 1, 0.2, 1, BRAIN_CHAMBERS[0].color), [])
    const geoConocimiento = useMemo(() => createChamberGeometry(-1, 0, 0, 1, -1, 0.2, BRAIN_CHAMBERS[1].color), [])
    const geoMemoria = useMemo(() => createChamberGeometry(-1, 1, -1, 0, -1, 1, BRAIN_CHAMBERS[3].color), [])
    const geoHerramientas = useMemo(() => createChamberGeometry(0, 1, 0, 1, -1, 0.2, BRAIN_CHAMBERS[2].color), [])

    // 4 low-density geometric blocks for the sparse wireframe
    const wireIdentidad = useMemo(() => createChamberGeometry(-1, 1, 0, 1, 0.2, 1, BRAIN_CHAMBERS[0].color, 4), [])
    const wireConocimiento = useMemo(() => createChamberGeometry(-1, 0, 0, 1, -1, 0.2, BRAIN_CHAMBERS[1].color, 4), [])
    const wireMemoria = useMemo(() => createChamberGeometry(-1, 1, -1, 0, -1, 1, BRAIN_CHAMBERS[3].color, 4), [])
    const wireHerramientas = useMemo(() => createChamberGeometry(0, 1, 0, 1, -1, 0.2, BRAIN_CHAMBERS[2].color, 4), [])

    // Hologram material (uses vertex colors)
    const holoMat = useMemo(() => createHologramMaterial(0.65), [])
    const detailMat = useMemo(() => createHologramMaterial(0.35), [])
    useEffect(() => { matsRef.current = [holoMat, detailMat] }, [holoMat, detailMat])

    // Animate: update shader time
    useFrame(({ clock }) => {
        const t = clock.elapsedTime
        // eslint-disable-next-line react-hooks/immutability
        for (const m of matsRef.current) m.uniforms.uTime.value = t
    })

    return (
        <group ref={brainRef}>
            {/* ─── LOW-DENSITY WIREFRAME (DIRECTLY ON THE CHAMBERS) ─── */}
            <group scale={1.005}>
                <mesh geometry={wireIdentidad}><meshBasicMaterial wireframe color={BRAIN_CHAMBERS[0].color} transparent opacity={0.03} blending={THREE.AdditiveBlending} depthWrite={false} /></mesh>
                <mesh geometry={wireConocimiento}><meshBasicMaterial wireframe color={BRAIN_CHAMBERS[1].color} transparent opacity={0.03} blending={THREE.AdditiveBlending} depthWrite={false} /></mesh>
                <mesh geometry={wireMemoria}><meshBasicMaterial wireframe color={BRAIN_CHAMBERS[3].color} transparent opacity={0.03} blending={THREE.AdditiveBlending} depthWrite={false} /></mesh>
                <mesh geometry={wireHerramientas}><meshBasicMaterial wireframe color={BRAIN_CHAMBERS[2].color} transparent opacity={0.03} blending={THREE.AdditiveBlending} depthWrite={false} /></mesh>
            </group>


            {/* ─── SOLID TRANSLUCENT INNER CORE (THE 4 CHAMBERS) ─── */}
            <group scale={1.0}>
                <mesh geometry={geoIdentidad} material={holoMat} />
                <mesh geometry={geoConocimiento} material={holoMat} />
                <mesh geometry={geoMemoria} material={holoMat} />
                <mesh geometry={geoHerramientas} material={holoMat} />
            </group>
        </group>
    )
}

/** Chamber labels anchored in 3D, always facing camera */
function ChamberLabels({ stats }: { stats: Record<BrainChamberKey, number> }) {
    return (
        <>
            {BRAIN_CHAMBERS.map((ch) => (
                <Html
                    key={ch.key}
                    position={[ch.position[0], ch.position[1] + ch.scale[1] + 0.22, ch.position[2] + 0.62]}
                    center
                    style={{ pointerEvents: 'none', userSelect: 'none' }}
                >
                    <div style={{
                        background: 'rgba(5,8,16,0.82)',
                        border: `1px solid ${hexColor(ch.color)}44`,
                        borderRadius: 8,
                        padding: '4px 10px',
                        color: hexColor(ch.color),
                        fontFamily: 'Inter, Arial, sans-serif',
                        fontWeight: 700,
                        fontSize: 13,
                        whiteSpace: 'nowrap',
                        textShadow: `0 0 8px ${hexColor(ch.color)}88`,
                    }}>
                        {ch.shortTitle} · {stats[ch.key]}
                    </div>
                </Html>
            ))}
        </>
    )
}

/** Compact Obsidian-style graph point with hover glow and neighbor highlighting */
const ObsidianGraphNode = memo(function ObsidianGraphNode({
    node, position, visible, isActive, isConnected, index, onHover, onClick,
}: {
    node: GraphNode; position: [number, number, number]; visible: boolean
    isActive: boolean; isConnected: boolean; index: number
    onHover: (node: GraphNode | null) => void; onClick: () => void
}) {
    const ref = useRef<THREE.Group>(null!)
    const chamber = useMemo(() => getChamberForNode(node), [node])
    const isCore = node.id.startsWith('core-')
    const radius = isCore ? 0.026 : 0.005
    const hitRadius = isCore ? 0.075 : 0.052
    const dimmed = Boolean(!isActive && !isConnected)

    const targetScale = 1.0

    return (
        <group
            ref={ref}
            position={position}
            visible={visible}
            scale={[targetScale, targetScale, targetScale]}
            onClick={(e) => { e.stopPropagation(); onClick() }}
            onPointerOver={(e) => { e.stopPropagation(); document.body.style.cursor = 'pointer'; onHover(node) }}
            onPointerOut={() => { document.body.style.cursor = 'auto'; onHover(null) }}
        >
            <mesh name="obsidian-node-hit-area">
                <sphereGeometry args={[hitRadius, 8, 6]} />
                <meshBasicMaterial transparent opacity={0} depthWrite={false} />
            </mesh>
            <mesh>
                <sphereGeometry args={[radius, isCore ? 16 : 10, isCore ? 12 : 8]} />
                <meshStandardMaterial
                    color={chamber.color}
                    emissive={chamber.color}
                    emissiveIntensity={isActive ? 2.2 : isConnected ? 1.25 : 0.55}
                    roughness={0.2}
                    transparent
                    opacity={dimmed ? 0.58 : 0.96}
                />
            </mesh>
            {(isActive || isCore) && (
                <mesh name={isActive ? 'obsidian-node-hover-ring' : 'obsidian-node-ring'}>
                    <sphereGeometry args={[radius * (isActive ? 2.55 : 1.9), isCore ? 16 : 10, isCore ? 12 : 8]} />
                    <meshBasicMaterial
                        color={chamber.color}
                        transparent
                        opacity={isActive ? 0.18 : 0.08}
                        depthWrite={false}
                        blending={THREE.AdditiveBlending}
                    />
                </mesh>
            )}
        </group>
    )
}, (prev, next) =>
    prev.node === next.node && prev.position === next.position &&
    prev.visible === next.visible && prev.isActive === next.isActive &&
    prev.isConnected === next.isConnected && prev.index === next.index
)
/** Hover tooltip rendered as HTML in 3D space */
function HoverTooltip({ node, position }: { node: GraphNode; position: [number, number, number] }) {
    const ch = getChamberForNode(node)
    return (
        <Html position={position} center style={{ pointerEvents: 'none', transform: 'translateY(-60px)' }}>
            <div style={{
                background: 'var(--color-bg-primary)',
                border: `1px solid var(--color-border)`,
                borderRadius: 10,
                padding: '10px 14px',
                maxWidth: 240,
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
                fontFamily: 'Inter, Arial, sans-serif',
            }}>
                <div style={{ color: 'var(--color-text-primary)', fontSize: 13, fontWeight: 700 }}>
                    {getDisplayName(node)}
                </div>
                {node.properties?.description && (
                    <div style={{ color: 'var(--color-text-secondary)', fontSize: 11, marginTop: 4, lineHeight: 1.4 }}>
                        {String(node.properties.description).slice(0, 200)}
                    </div>
                )}
                {node.labels?.[0] && (
                    <div style={{
                        marginTop: 6, display: 'inline-block', fontSize: 10,
                        padding: '2px 8px', borderRadius: 4,
                        background: `${hexColor(ch.color)}18`, color: hexColor(ch.color),
                        border: `1px solid ${hexColor(ch.color)}33`,
                    }}>
                        {node.labels[0]}
                    </div>
                )}
            </div>
        </Html>
    )
}

/** OrbitControls with animated zoom-to-node */
function CameraRig({ zoomTarget }: { zoomTarget: [number, number, number] | null }) {
    const controlsRef = useRef<any>(null!) // eslint-disable-line @typescript-eslint/no-explicit-any
    const animating = useRef(false)
    const targetRef = useRef<[number, number, number] | null>(null)

    useEffect(() => {
        if (!zoomTarget) return
        targetRef.current = zoomTarget
        animating.current = true
    }, [zoomTarget])

    useFrame(() => {
        if (!animating.current || !targetRef.current || !controlsRef.current) return
        const t = new THREE.Vector3(...targetRef.current)
        controlsRef.current.target.lerp(t, 0.08)
        controlsRef.current.update()
        if (controlsRef.current.target.distanceTo(t) < 0.02) animating.current = false
    })

    return (
        <OrbitControls
            ref={controlsRef}
            enableDamping dampingFactor={0.08}
            minDistance={2.8} maxDistance={9}
            maxPolarAngle={Math.PI * 0.85}
        />
    )
}

/** Wraps the entire scene to rotate everything (brain, edges, nodes) synchronously */
function SceneContainer({ children }: { children: React.ReactNode }) {
    const groupRef = useRef<THREE.Group>(null!)
    useFrame(({ clock }) => {
        const t = clock.elapsedTime
        if (groupRef.current) {
            // groupRef.current.rotation.y = t * 0.07 + Math.sin(t * 0.38) * 0.035
        }
    })
    return <group ref={groupRef} rotation={[0.04, 0, 0]}>{children}</group>
}

// ═══════════════════════════════════════════════════════════
// MAIN EXPORT
// ═══════════════════════════════════════════════════════════

export default function Brain3DGraph({ nodes, edges, searchQuery, activeNodeId, onNodeClick }: Brain3DGraphProps) {
    const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null)
    const [zoomTarget, setZoomTarget] = useState<[number, number, number] | null>(null)

    const chamberStats = useMemo(() => getChamberStats(nodes), [nodes])
    const memoryLoad = Math.min(1, chamberStats.memoria / 40)
    const searchStr = searchQuery.toLowerCase()


    // Geometries are instantiated inline inside ObsidianGraphNode to ensure safety across WebGL context loss/HMR

    // ─── INJECT VIRTUAL CORE NODES & RADIAL EDGES ───
    const extendedNodes = useMemo(() => {
        if (nodes.length === 0) return []
        const coreNodes: GraphNode[] = BRAIN_CHAMBERS.map(ch => ({
            id: `core-${ch.key}`,
            labels: [ch.title.toUpperCase()],
            properties: { displayName: ch.title, description: `Centro neural de la cámara de ${ch.title}.` }
        }))
        return [...coreNodes, ...nodes]
    }, [nodes])

    const extendedEdges = useMemo(() => {
        if (nodes.length === 0) return []
        const radialEdges: GraphEdge[] = nodes.map(n => ({
            id: `radial-${n.id}`,
            source: `core-${getChamberForNode(n).key}`,
            target: n.id,
            type: 'BRANCHES_TO'
        }))
        const coreEdges: GraphEdge[] = [
            { source: 'core-identidad', target: 'core-conocimiento', type: 'CORE_LINK' },
            { source: 'core-identidad', target: 'core-herramientas', type: 'CORE_LINK' },
            { source: 'core-identidad', target: 'core-memoria', type: 'CORE_LINK' },
            { source: 'core-conocimiento', target: 'core-memoria', type: 'CORE_LINK' },
        ]
        return [...edges, ...radialEdges, ...coreEdges]
    }, [nodes, edges])

    const nodeById = useMemo(
        () => new Map(extendedNodes.map((node) => [node.id, node])),
        [extendedNodes]
    )

    // Compute node physical layout using extended nodes
    const nodePositions = useMemo(
        () => computeForceLayout(extendedNodes, extendedEdges, memoryLoad),
        [extendedNodes, extendedEdges, memoryLoad]
    )

    // Filter visibility based on search (always show cores)
    const visibleNodes = useMemo(() => {
        const v = new Set<string>()
        if (!searchStr) {
            extendedNodes.forEach(n => v.add(n.id))
            return v
        }
        const matches = new Set<string>()
        extendedNodes.forEach(n => {
            if (n.id.startsWith('core-')) v.add(n.id) // cores always visible
            else if (getDisplayName(n).toLowerCase().includes(searchStr) || (n.labels && n.labels[0].toLowerCase().includes(searchStr))) {
                v.add(n.id)
                matches.add(n.id)
            }
        })
        extendedEdges.forEach((edge) => {
            if (!isSameChamberEdge(edge, nodeById)) return
            if (matches.has(edge.source)) v.add(edge.target)
            if (matches.has(edge.target)) v.add(edge.source)
        })
        return v
    }, [extendedEdges, extendedNodes, nodeById, searchStr])

    const connectedNodeIds = useMemo(() => {
        const activeId = activeNodeId ?? null
        if (!activeId) return new Set<string>()
        const connected = new Set<string>([activeId])
        extendedEdges.forEach((edge) => {
            if (!isSameChamberEdge(edge, nodeById)) return
            if (edge.source === activeId) connected.add(edge.target)
            if (edge.target === activeId) connected.add(edge.source)
        })
        return connected
    }, [extendedEdges, activeNodeId, nodeById])

    const edgesMesh = useMemo(
        () => buildSynapseEdges(extendedEdges, nodeById, nodePositions, visibleNodes, activeNodeId ?? null),
        [extendedEdges, activeNodeId, nodeById, nodePositions, visibleNodes]
    )

    const onNodeClickRef = useRef(onNodeClick)
    useEffect(() => { onNodeClickRef.current = onNodeClick }, [onNodeClick])

    const handleNodeClick = useCallback((node: GraphNode) => {
        const pos = nodePositions.get(node.id)
        if (pos) setZoomTarget(pos)
        onNodeClickRef.current(node)
    }, [nodePositions])

    const handleHover = useCallback((node: GraphNode | null) => setHoveredNode(node), [])

    if (extendedNodes.length === 0) return null
    const hoveredPos = hoveredNode ? nodePositions.get(hoveredNode.id) : undefined

    return (
        <div style={{ position: 'relative', width: '100%', height: '100%', background: 'transparent', overflow: 'hidden', touchAction: 'none' }}>
            <Canvas
                camera={{ position: [0, 0.2, 4.8], fov: 38, near: 0.1, far: 100 }}
                style={{ width: '100%', height: '100%', background: 'transparent' }}
                gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
                dpr={[1, 2]}
            >
                <ambientLight intensity={0.35} />
                <directionalLight position={[2, 3, 5]} intensity={0.4} />
                <directionalLight position={[-3, 2, -3]} intensity={0.25} color={0xffffff} />
                <pointLight position={[0, -1.4, 2.2]} intensity={0.2} distance={6} color={0xffffff} />

                <Suspense fallback={null}>
                    <SceneContainer>
                        <BrainAnatomy />
                        
                        {/* Synapse Lines */}
                        <primitive object={edgesMesh} />

                        {/* Nodes grouped by chamber to reduce draw calls */}
                        <group>
                            {extendedNodes.map((node, i) => {
                                const pos = nodePositions.get(node.id)
                                if (!pos) return null
                                return (
                                    <ObsidianGraphNode
                                        key={node.id}
                                        node={node}
                                        position={pos}
                                        visible={visibleNodes.has(node.id)}
                                        isActive={activeNodeId === node.id}
                                        isConnected={connectedNodeIds.size === 0 || connectedNodeIds.has(node.id)}
                                        index={i}
                                        onHover={handleHover}
                                        onClick={() => handleNodeClick(node)}
                                    />
                                )
                            })}
                        </group>

                        {hoveredNode && hoveredPos && (
                            <HoverTooltip node={hoveredNode} position={hoveredPos} />
                        )}
                    </SceneContainer>
                </Suspense>

                <CameraRig zoomTarget={zoomTarget} />
            </Canvas>

            {/* Legend overlay */}
            <div style={{
                position: 'absolute', top: 18, left: 18, right: 18,
                display: 'flex', justifyContent: 'center', gap: 24, flexWrap: 'wrap',
                pointerEvents: 'none', zIndex: 10,
            }}>
                {BRAIN_CHAMBERS.map((ch) => (
                    <div key={ch.key} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div style={{
                            width: 8,
                            height: 8,
                            borderRadius: '50%',
                            background: hexColor(ch.color),
                            opacity: 0.7,
                            flexShrink: 0,
                            boxShadow: `0 0 8px ${hexColor(ch.color)}88`
                        }} />
                        <div style={{
                            color: hexColor(ch.color),
                            fontSize: 11,
                            fontWeight: 500,
                            opacity: 0.85,
                            textShadow: '0 2px 4px rgba(0,0,0,0.8)', // Ensures legibility against 3D canvas
                        }}>
                            {ch.title} <span style={{ opacity: 0.6 }}>({chamberStats[ch.key]})</span>
                        </div>
                    </div>
                ))}
            </div>

        </div>
    )
}
