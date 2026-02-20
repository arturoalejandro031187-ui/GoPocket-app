'use client';

import { useState } from 'react';

// ─── Types ───────────────────────────────────────────────────────────────────

export type ClothingType =
    | 'tops'
    | 'bottoms'
    | 'dresses'
    | 'outerwear'
    | 'underwear'
    | 'footwear'
    | 'activewear'
    | 'kids'
    | 'babies';

interface SizeRow {
    size: string;
    measurements: Record<string, string>;
}

interface ChartConfig {
    title: string;
    measurementKeys: { key: string; label: string }[];
    sizes: SizeRow[];
    diagramType: ClothingType;
}

// ─── Default Size Data ────────────────────────────────────────────────────────

const TOPS_CHART: ChartConfig = {
    title: 'Tops, Blusas y Camisas',
    diagramType: 'tops',
    measurementKeys: [
        { key: 'hombro', label: 'Hombro' },
        { key: 'busto', label: 'Busto' },
        { key: 'cintura', label: 'Cintura' },
        { key: 'largo', label: 'Largo' },
        { key: 'manga', label: 'Manga' },
    ],
    sizes: [
        { size: 'XS', measurements: { hombro: '35', busto: '80–84', cintura: '60–64', largo: '58', manga: '58' } },
        { size: 'S', measurements: { hombro: '36', busto: '84–88', cintura: '64–68', largo: '60', manga: '59' } },
        { size: 'M', measurements: { hombro: '37', busto: '88–92', cintura: '68–72', largo: '62', manga: '60' } },
        { size: 'L', measurements: { hombro: '38', busto: '92–96', cintura: '72–76', largo: '64', manga: '61' } },
        { size: 'XL', measurements: { hombro: '39', busto: '96–100', cintura: '76–80', largo: '66', manga: '62' } },
        { size: '2XL', measurements: { hombro: '40', busto: '100–106', cintura: '80–86', largo: '68', manga: '63' } },
        { size: '3XL', measurements: { hombro: '41', busto: '106–112', cintura: '86–92', largo: '70', manga: '64' } },
    ],
};

const BOTTOMS_CHART: ChartConfig = {
    title: 'Pantalones, Jeans y Shorts',
    diagramType: 'bottoms',
    measurementKeys: [
        { key: 'cintura', label: 'Cintura' },
        { key: 'cadera', label: 'Cadera' },
        { key: 'muslo', label: 'Muslo' },
        { key: 'entrepierna', label: 'Entrepierna' },
        { key: 'largo', label: 'Largo Total' },
    ],
    sizes: [
        { size: 'XS / 24', measurements: { cintura: '60–64', cadera: '84–88', muslo: '52', entrepierna: '70', largo: '96' } },
        { size: 'S / 26', measurements: { cintura: '64–68', cadera: '88–92', muslo: '54', entrepierna: '72', largo: '98' } },
        { size: 'M / 28', measurements: { cintura: '68–72', cadera: '92–96', muslo: '56', entrepierna: '74', largo: '100' } },
        { size: 'L / 30', measurements: { cintura: '72–76', cadera: '96–100', muslo: '58', entrepierna: '76', largo: '102' } },
        { size: 'XL / 32', measurements: { cintura: '76–80', cadera: '100–106', muslo: '61', entrepierna: '78', largo: '104' } },
        { size: '2XL / 34', measurements: { cintura: '80–86', cadera: '106–112', muslo: '64', entrepierna: '79', largo: '105' } },
        { size: '3XL / 36', measurements: { cintura: '86–92', cadera: '112–118', muslo: '67', entrepierna: '80', largo: '106' } },
    ],
};

const DRESSES_CHART: ChartConfig = {
    title: 'Vestidos y Faldas',
    diagramType: 'dresses',
    measurementKeys: [
        { key: 'busto', label: 'Busto' },
        { key: 'cintura', label: 'Cintura' },
        { key: 'cadera', label: 'Cadera' },
        { key: 'largo', label: 'Largo Total' },
        { key: 'hombro', label: 'Hombro' },
    ],
    sizes: [
        { size: 'XS', measurements: { busto: '80–84', cintura: '60–64', cadera: '84–88', largo: '90', hombro: '35' } },
        { size: 'S', measurements: { busto: '84–88', cintura: '64–68', cadera: '88–92', largo: '93', hombro: '36' } },
        { size: 'M', measurements: { busto: '88–92', cintura: '68–72', cadera: '92–96', largo: '96', hombro: '37' } },
        { size: 'L', measurements: { busto: '92–96', cintura: '72–76', cadera: '96–100', largo: '99', hombro: '38' } },
        { size: 'XL', measurements: { busto: '96–100', cintura: '76–80', cadera: '100–106', largo: '102', hombro: '39' } },
        { size: '2XL', measurements: { busto: '100–106', cintura: '80–86', cadera: '106–112', largo: '105', hombro: '40' } },
        { size: '3XL', measurements: { busto: '106–112', cintura: '86–92', cadera: '112–118', largo: '108', hombro: '41' } },
    ],
};

const OUTERWEAR_CHART: ChartConfig = {
    title: 'Chamarras, Abrigos y Suéteres',
    diagramType: 'outerwear',
    measurementKeys: [
        { key: 'hombro', label: 'Hombro' },
        { key: 'busto', label: 'Busto / Pecho' },
        { key: 'cintura', label: 'Cintura' },
        { key: 'largo', label: 'Largo' },
        { key: 'manga', label: 'Largo de Manga' },
    ],
    sizes: [
        { size: 'XS', measurements: { hombro: '36', busto: '82–86', cintura: '64–68', largo: '65', manga: '60' } },
        { size: 'S', measurements: { hombro: '38', busto: '86–90', cintura: '68–72', largo: '67', manga: '61' } },
        { size: 'M', measurements: { hombro: '40', busto: '90–94', cintura: '72–76', largo: '69', manga: '62' } },
        { size: 'L', measurements: { hombro: '42', busto: '94–98', cintura: '76–80', largo: '71', manga: '63' } },
        { size: 'XL', measurements: { hombro: '43', busto: '98–102', cintura: '80–84', largo: '73', manga: '64' } },
        { size: '2XL', measurements: { hombro: '44', busto: '102–108', cintura: '84–90', largo: '75', manga: '65' } },
        { size: '3XL', measurements: { hombro: '45', busto: '108–114', cintura: '90–96', largo: '77', manga: '66' } },
    ],
};

const FOOTWEAR_CHART: ChartConfig = {
    title: 'Calzado',
    diagramType: 'footwear',
    measurementKeys: [
        { key: 'pie_cm', label: 'Pie (cm)' },
        { key: 'mx', label: 'MX' },
        { key: 'usa_w', label: 'USA (Mujer)' },
        { key: 'usa_m', label: 'USA (Hombre)' },
        { key: 'eur', label: 'EUR' },
    ],
    sizes: [
        { size: '21.5', measurements: { pie_cm: '21.5', mx: '21.5', usa_w: '4.5', usa_m: '3', eur: '34' } },
        { size: '22', measurements: { pie_cm: '22.0', mx: '22', usa_w: '5', usa_m: '3.5', eur: '35' } },
        { size: '22.5', measurements: { pie_cm: '22.5', mx: '22.5', usa_w: '5.5', usa_m: '4', eur: '35–36' } },
        { size: '23', measurements: { pie_cm: '23.0', mx: '23', usa_w: '6', usa_m: '4.5', eur: '36' } },
        { size: '23.5', measurements: { pie_cm: '23.5', mx: '23.5', usa_w: '6.5', usa_m: '5', eur: '37' } },
        { size: '24', measurements: { pie_cm: '24.0', mx: '24', usa_w: '7', usa_m: '5.5', eur: '37–38' } },
        { size: '24.5', measurements: { pie_cm: '24.5', mx: '24.5', usa_w: '7.5', usa_m: '6', eur: '38' } },
        { size: '25', measurements: { pie_cm: '25.0', mx: '25', usa_w: '8', usa_m: '6.5', eur: '38–39' } },
        { size: '25.5', measurements: { pie_cm: '25.5', mx: '25.5', usa_w: '8.5', usa_m: '7', eur: '39' } },
        { size: '26', measurements: { pie_cm: '26.0', mx: '26', usa_w: '9', usa_m: '7.5', eur: '40' } },
        { size: '26.5', measurements: { pie_cm: '26.5', mx: '26.5', usa_w: '9.5', usa_m: '8', eur: '40–41' } },
        { size: '27', measurements: { pie_cm: '27.0', mx: '27', usa_w: '10', usa_m: '8.5', eur: '41' } },
        { size: '27.5', measurements: { pie_cm: '27.5', mx: '27.5', usa_w: '10.5', usa_m: '9', eur: '42' } },
        { size: '28', measurements: { pie_cm: '28.0', mx: '28', usa_w: '11', usa_m: '9.5', eur: '42–43' } },
    ],
};

const UNDERWEAR_CHART: ChartConfig = {
    title: 'Ropa Interior y Lencería',
    diagramType: 'underwear',
    measurementKeys: [
        { key: 'busto', label: 'Busto / Pecho' },
        { key: 'cintura', label: 'Cintura' },
        { key: 'cadera', label: 'Cadera' },
    ],
    sizes: [
        { size: 'XS', measurements: { busto: '76–80', cintura: '58–62', cadera: '82–86' } },
        { size: 'S', measurements: { busto: '80–84', cintura: '62–66', cadera: '86–90' } },
        { size: 'M', measurements: { busto: '84–88', cintura: '66–70', cadera: '90–94' } },
        { size: 'L', measurements: { busto: '88–92', cintura: '70–74', cadera: '94–98' } },
        { size: 'XL', measurements: { busto: '92–96', cintura: '74–78', cadera: '98–102' } },
        { size: '2XL', measurements: { busto: '96–102', cintura: '78–84', cadera: '102–108' } },
        { size: '3XL', measurements: { busto: '102–108', cintura: '84–90', cadera: '108–114' } },
    ],
};

const KIDS_CHART: ChartConfig = {
    title: 'Niños y Niñas (2–16 años)',
    diagramType: 'kids',
    measurementKeys: [
        { key: 'edad', label: 'Edad Aprox.' },
        { key: 'altura', label: 'Talla (cm)' },
        { key: 'pecho', label: 'Pecho' },
        { key: 'cintura', label: 'Cintura' },
        { key: 'cadera', label: 'Cadera' },
    ],
    sizes: [
        { size: '2T', measurements: { edad: '2 años', altura: '86–92', pecho: '52', cintura: '50', cadera: '53' } },
        { size: '4T', measurements: { edad: '4 años', altura: '98–104', pecho: '56', cintura: '52', cadera: '57' } },
        { size: '6', measurements: { edad: '6 años', altura: '110–116', pecho: '60', cintura: '54', cadera: '62' } },
        { size: '8', measurements: { edad: '7–8 años', altura: '122–128', pecho: '64', cintura: '57', cadera: '67' } },
        { size: '10', measurements: { edad: '9–10 años', altura: '134–140', pecho: '68', cintura: '60', cadera: '72' } },
        { size: '12', measurements: { edad: '11–12 años', altura: '146–152', pecho: '74', cintura: '64', cadera: '78' } },
        { size: '14', measurements: { edad: '13–14 años', altura: '158–164', pecho: '80', cintura: '68', cadera: '84' } },
        { size: '16', measurements: { edad: '15–16 años', altura: '164–170', pecho: '86', cintura: '72', cadera: '90' } },
    ],
};

const BABIES_CHART: ChartConfig = {
    title: 'Bebés (0–24 meses)',
    diagramType: 'babies',
    measurementKeys: [
        { key: 'edad', label: 'Edad Aprox.' },
        { key: 'altura', label: 'Talla / Altura' },
        { key: 'peso', label: 'Peso Aprox.' },
        { key: 'pecho', label: 'Pecho' },
    ],
    sizes: [
        { size: 'RN', measurements: { edad: '0–1 mes', altura: '50–56', peso: '3.5 kg', pecho: '34' } },
        { size: '0–3m', measurements: { edad: '0–3 meses', altura: '56–62', peso: '4.5 kg', pecho: '36' } },
        { size: '3–6m', measurements: { edad: '3–6 meses', altura: '62–68', peso: '6.5 kg', pecho: '40' } },
        { size: '6–9m', measurements: { edad: '6–9 meses', altura: '68–74', peso: '8 kg', pecho: '43' } },
        { size: '9–12m', measurements: { edad: '9–12 meses', altura: '74–80', peso: '9.5 kg', pecho: '46' } },
        { size: '12–18m', measurements: { edad: '12–18 meses', altura: '80–86', peso: '11 kg', pecho: '49' } },
        { size: '18–24m', measurements: { edad: '18–24 meses', altura: '86–92', peso: '12.5 kg', pecho: '52' } },
    ],
};

// ─── Category Detection ────────────────────────────────────────────────────────

export function detectClothingType(
    category: string | null | undefined,
    subcategory?: string | null,
): ClothingType | null {
    const sub = (subcategory || '').toLowerCase();
    const cat = (category || '').toLowerCase();

    if (
        sub.includes('tenis') || sub.includes('bota') || sub.includes('sandalia') ||
        sub.includes('tacón') || sub.includes('zapato') || sub.includes('flat') ||
        cat === 'calzado' || sub.includes('zapatill') || sub.includes('sneaker')
    ) return 'footwear';

    if (sub.includes('bebé') || sub.includes('bebe') || cat.includes('bebé') || sub.includes('meses')) return 'babies';
    if (cat.includes('niños') || cat.includes('niñas') || sub.includes('niño') || sub.includes('niña')) return 'kids';

    if (sub.includes('lencería') || sub.includes('interior') || sub.includes('bralets') || sub.includes('calceta')) return 'underwear';
    if (sub.includes('vestido') || sub.includes('falda') || sub.includes('jumper')) return 'dresses';

    if (
        sub.includes('pantalón') || sub.includes('pantalon') || sub.includes('jean') ||
        sub.includes('short') || sub.includes('bermuda') || sub.includes('overol')
    ) return 'bottoms';

    if (
        sub.includes('chamarra') || sub.includes('abrigo') || sub.includes('suéter') ||
        sub.includes('sudadera') || sub.includes('saco') || sub.includes('chaleco')
    ) return 'outerwear';

    if (
        sub.includes('blusa') || sub.includes('top') || sub.includes('playera') ||
        sub.includes('camisa') || sub.includes('polo') || sub.includes('traje') ||
        cat.includes('ropa') || sub.includes('pijama') || sub.includes('deportiva')
    ) return 'tops';

    return null;
}

function getChartConfig(type: ClothingType): ChartConfig {
    switch (type) {
        case 'bottoms': return BOTTOMS_CHART;
        case 'dresses': return DRESSES_CHART;
        case 'outerwear': return OUTERWEAR_CHART;
        case 'footwear': return FOOTWEAR_CHART;
        case 'underwear': return UNDERWEAR_CHART;
        case 'kids': return KIDS_CHART;
        case 'babies': return BABIES_CHART;
        case 'activewear':
        case 'tops':
        default: return TOPS_CHART;
    }
}

// ─── Clean SVG Diagrams ───────────────────────────────────────────────────────
// Strategy: numbers in labeled callouts on the SIDE, never overlapping body lines.
// Colors: body = gray-200, measurement lines = pink (#e3127d)

const PINK = '#e3127d';
const PURPLE = '#7c3aed';
const BODY_FILL = '#f1f5f9';
const BODY_STROKE = '#cbd5e1';

function Callout({ x, y, n, color = PINK }: { x: number; y: number; n: number; color?: string }) {
    return (
        <g>
            <circle cx={x} cy={y} r={8} fill={color} />
            <text x={x} y={y + 3.5} fontSize="9" fontWeight="800" fill="white" textAnchor="middle">{n}</text>
        </g>
    );
}

function MeasLine({ x1, y1, x2, y2, dashed = true }: { x1: number; y1: number; x2: number; y2: number; dashed?: boolean }) {
    return (
        <line
            x1={x1} y1={y1} x2={x2} y2={y2}
            stroke={PINK} strokeWidth="1.5"
            strokeDasharray={dashed ? '5 3' : undefined}
        />
    );
}

function Arrow({ x1, y1, x2, y2 }: { x1: number; y1: number; x2: number; y2: number }) {
    // vertical double-headed arrow
    return (
        <g>
            <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={PURPLE} strokeWidth="1.5" />
            <line x1={x1 - 4} y1={y1} x2={x1 + 4} y2={y1} stroke={PURPLE} strokeWidth="1.5" />
            <line x1={x2 - 4} y1={y2} x2={x2 + 4} y2={y2} stroke={PURPLE} strokeWidth="1.5" />
        </g>
    );
}

function TopsDiagram() {
    return (
        <svg viewBox="0 0 200 260" className="w-full max-w-[170px]" aria-label="Diagrama tops">
            {/* Head */}
            <ellipse cx="100" cy="28" rx="18" ry="22" fill={BODY_FILL} stroke={BODY_STROKE} strokeWidth="1.5" />
            {/* Torso */}
            <path d="M68 76 Q68 56 100 54 Q132 56 132 76 L130 170 L70 170 Z" fill={BODY_FILL} stroke={BODY_STROKE} strokeWidth="1.5" />
            {/* Left arm */}
            <path d="M68 76 Q54 78 44 130 Q52 133 56 132 Q58 110 70 100" fill={BODY_FILL} stroke={BODY_STROKE} strokeWidth="1.5" />
            {/* Right arm */}
            <path d="M132 76 Q146 78 156 130 Q148 133 144 132 Q142 110 130 100" fill={BODY_FILL} stroke={BODY_STROKE} strokeWidth="1.5" />
            {/* Legs stub */}
            <rect x="70" y="170" width="24" height="50" rx="2" fill={BODY_FILL} stroke={BODY_STROKE} strokeWidth="1.5" />
            <rect x="106" y="170" width="24" height="50" rx="2" fill={BODY_FILL} stroke={BODY_STROKE} strokeWidth="1.5" />

            {/* ①  Hombro — horizontal across shoulders, callout LEFT */}
            <MeasLine x1={68} y1={76} x2={132} y2={76} />
            <Callout x={22} y={76} n={1} />
            <line x1={30} y1={76} x2={68} y2={76} stroke={PINK} strokeWidth="1" strokeDasharray="3 3" />

            {/* ② Busto — horizontal, callout LEFT */}
            <MeasLine x1={68} y1={102} x2={132} y2={102} />
            <Callout x={22} y={102} n={2} />
            <line x1={30} y1={102} x2={68} y2={102} stroke={PINK} strokeWidth="1" strokeDasharray="3 3" />

            {/* ③ Cintura — horizontal, callout LEFT */}
            <MeasLine x1={70} y1={135} x2={130} y2={135} />
            <Callout x={22} y={135} n={3} />
            <line x1={30} y1={135} x2={70} y2={135} stroke={PINK} strokeWidth="1" strokeDasharray="3 3" />

            {/* ④ Largo — vertical right side */}
            <Arrow x1={158} y1={76} x2={158} y2={170} />
            <Callout x={178} y={123} n={4} color={PURPLE} />

            {/* ⑤ Manga — along left sleeve, callout lower-left */}
            <MeasLine x1={68} y1={76} x2={46} y2={130} dashed />
            <Callout x={22} y={163} n={5} />
            <line x1={30} y1={163} x2={46} y2={130} stroke={PINK} strokeWidth="1" strokeDasharray="3 3" />

            <text x="100" y="252" fontSize="7" fill="#94a3b8" textAnchor="middle">Medidas en cm</text>
        </svg>
    );
}

function BottomsDiagram() {
    return (
        <svg viewBox="0 0 200 290" className="w-full max-w-[170px]" aria-label="Diagrama pantalones">
            {/* Waistband */}
            <rect x="58" y="28" width="84" height="14" rx="4" fill={BODY_FILL} stroke={BODY_STROKE} strokeWidth="1.5" />
            {/* Left leg */}
            <path d="M58 42 L58 230 L96 230 L100 145 L96 42 Z" fill={BODY_FILL} stroke={BODY_STROKE} strokeWidth="1.5" />
            {/* Right leg */}
            <path d="M104 42 L104 230 L142 230 L142 145 L100 145 L104 42 Z" fill={BODY_FILL} stroke={BODY_STROKE} strokeWidth="1.5" />

            {/* ① Cintura */}
            <MeasLine x1={58} y1={35} x2={142} y2={35} />
            <Callout x={22} y={35} n={1} />
            <line x1={30} y1={35} x2={58} y2={35} stroke={PINK} strokeWidth="1" strokeDasharray="3 3" />

            {/* ② Cadera */}
            <MeasLine x1={58} y1={80} x2={142} y2={80} />
            <Callout x={22} y={80} n={2} />
            <line x1={30} y1={80} x2={58} y2={80} stroke={PINK} strokeWidth="1" strokeDasharray="3 3" />

            {/* ③ Muslo (left leg width at top) */}
            <MeasLine x1={58} y1={105} x2={96} y2={105} />
            <Callout x={22} y={105} n={3} />
            <line x1={30} y1={105} x2={58} y2={105} stroke={PINK} strokeWidth="1" strokeDasharray="3 3" />

            {/* ④ Entrepierna — right side vertical from crotch to hem */}
            <Arrow x1={158} y1={95} x2={158} y2={230} />
            <Callout x={178} y={162} n={4} color={PURPLE} />

            {/* ⑤ Largo Total — left side from waist to hem */}
            <Arrow x1={38} y1={28} x2={38} y2={230} />
            <Callout x={18} y={130} n={5} color={PURPLE} />

            <text x="100" y="280" fontSize="7" fill="#94a3b8" textAnchor="middle">Medidas en cm</text>
        </svg>
    );
}

function DressDiagram() {
    return (
        <svg viewBox="0 0 200 290" className="w-full max-w-[170px]" aria-label="Diagrama vestidos">
            {/* Head */}
            <ellipse cx="100" cy="22" rx="15" ry="18" fill={BODY_FILL} stroke={BODY_STROKE} strokeWidth="1.5" />
            {/* A-line dress */}
            <path d="M68 58 Q68 44 100 42 Q132 44 132 58 L148 250 L52 250 Z" fill={BODY_FILL} stroke={BODY_STROKE} strokeWidth="1.5" />
            {/* Waist tuck hint */}
            <path d="M72 125 Q100 118 128 125" fill="none" stroke={BODY_STROKE} strokeWidth="1" strokeDasharray="2 3" />

            {/* ① Hombro — shoulders */}
            <MeasLine x1={68} y1={58} x2={132} y2={58} />
            <Callout x={22} y={58} n={1} />
            <line x1={30} y1={58} x2={68} y2={58} stroke={PINK} strokeWidth="1" strokeDasharray="3 3" />

            {/* ② Busto */}
            <MeasLine x1={68} y1={82} x2={132} y2={82} />
            <Callout x={22} y={82} n={2} />
            <line x1={30} y1={82} x2={68} y2={82} stroke={PINK} strokeWidth="1" strokeDasharray="3 3" />

            {/* ③ Cintura */}
            <MeasLine x1={71} y1={122} x2={129} y2={122} />
            <Callout x={22} y={122} n={3} />
            <line x1={30} y1={122} x2={71} y2={122} stroke={PINK} strokeWidth="1" strokeDasharray="3 3" />

            {/* ④ Cadera */}
            <MeasLine x1={77} y1={158} x2={123} y2={158} />
            <Callout x={22} y={158} n={4} />
            <line x1={30} y1={158} x2={77} y2={158} stroke={PINK} strokeWidth="1" strokeDasharray="3 3" />

            {/* ⑤ Largo Total — right side */}
            <Arrow x1={162} y1={58} x2={162} y2={250} />
            <Callout x={178} y={154} n={5} color={PURPLE} />

            <text x="100" y="280" fontSize="7" fill="#94a3b8" textAnchor="middle">Medidas en cm</text>
        </svg>
    );
}

function FootwearDiagram() {
    return (
        <svg viewBox="0 0 220 170" className="w-full max-w-[200px]" aria-label="Diagrama calzado">
            {/* Foot sole */}
            <path
                d="M30 50 C30 28 52 18 78 18 C100 18 118 22 132 34 C148 46 172 54 182 68 C192 82 188 118 174 128 C160 138 28 138 22 116 C12 94 24 68 30 50 Z"
                fill={BODY_FILL} stroke={BODY_STROKE} strokeWidth="2"
            />
            {/* Toe bumps */}
            <ellipse cx="80" cy="24" rx="8" ry="6.5" fill="#e2e8f0" stroke={BODY_STROKE} strokeWidth="1" />
            <ellipse cx="96" cy="20" rx="7" ry="6" fill="#e2e8f0" stroke={BODY_STROKE} strokeWidth="1" />
            <ellipse cx="110" cy="24" rx="6" ry="5" fill="#e2e8f0" stroke={BODY_STROKE} strokeWidth="1" />
            <ellipse cx="122" cy="32" rx="5.5" ry="4.5" fill="#e2e8f0" stroke={BODY_STROKE} strokeWidth="1" />
            <ellipse cx="132" cy="42" rx="4.5" ry="3.5" fill="#e2e8f0" stroke={BODY_STROKE} strokeWidth="1" />

            {/* Length arrow */}
            <line x1="22" y1="152" x2="174" y2="152" stroke={PINK} strokeWidth="2" />
            <polygon points="174,149 180,152 174,155" fill={PINK} />
            <polygon points="22,149 16,152 22,155" fill={PINK} />
            <text x="98" y="148" fontSize="9" fontWeight="700" fill={PINK} textAnchor="middle">① Largo del pie</text>

            {/* Width arrow (angled right side) */}
            <line x1="186" y1="68" x2="186" y2="128" stroke={PURPLE} strokeWidth="1.5" />
            <line x1="182" y1="68" x2="190" y2="68" stroke={PURPLE} strokeWidth="1.5" />
            <line x1="182" y1="128" x2="190" y2="128" stroke={PURPLE} strokeWidth="1.5" />
            <text x="208" y="102" fontSize="8" fontWeight="700" fill={PURPLE} textAnchor="middle" transform="rotate(90,208,102)">② Ancho</text>

            <text x="110" y="165" fontSize="7" fill="#94a3b8" textAnchor="middle">Traza el pie sobre papel, mide talón→dedo mayor</text>
        </svg>
    );
}

function KidsDiagram() {
    return (
        <svg viewBox="0 0 200 280" className="w-full max-w-[170px]" aria-label="Diagrama niños">
            {/* Head */}
            <ellipse cx="100" cy="30" rx="21" ry="25" fill={BODY_FILL} stroke={BODY_STROKE} strokeWidth="1.5" />
            {/* Torso */}
            <path d="M72 76 Q72 60 100 58 Q128 60 128 76 L126 162 L74 162 Z" fill={BODY_FILL} stroke={BODY_STROKE} strokeWidth="1.5" />
            {/* Arms */}
            <path d="M72 76 Q58 80 46 128 Q54 132 58 130 Q60 108 74 98" fill={BODY_FILL} stroke={BODY_STROKE} strokeWidth="1.5" />
            <path d="M128 76 Q142 80 154 128 Q146 132 142 130 Q140 108 126 98" fill={BODY_FILL} stroke={BODY_STROKE} strokeWidth="1.5" />
            {/* Legs */}
            <rect x="73" y="162" width="22" height="80" rx="3" fill={BODY_FILL} stroke={BODY_STROKE} strokeWidth="1.5" />
            <rect x="105" y="162" width="22" height="80" rx="3" fill={BODY_FILL} stroke={BODY_STROKE} strokeWidth="1.5" />

            {/* ① Altura — full left side */}
            <Arrow x1={42} y1={5} x2={42} y2={242} />
            <Callout x={22} y={124} n={1} color={PURPLE} />

            {/* ② Pecho */}
            <MeasLine x1={72} y1={94} x2={128} y2={94} />
            <Callout x={160} y={94} n={2} />
            <line x1={128} y1={94} x2={152} y2={94} stroke={PINK} strokeWidth="1" strokeDasharray="3 3" />

            {/* ③ Cintura */}
            <MeasLine x1={73} y1={130} x2={127} y2={130} />
            <Callout x={160} y={130} n={3} />
            <line x1={127} y1={130} x2={152} y2={130} stroke={PINK} strokeWidth="1" strokeDasharray="3 3" />

            {/* ④ Cadera */}
            <MeasLine x1={73} y1={162} x2={127} y2={162} />
            <Callout x={160} y={162} n={4} />
            <line x1={127} y1={162} x2={152} y2={162} stroke={PINK} strokeWidth="1" strokeDasharray="3 3" />

            <text x="100" y="274" fontSize="7" fill="#94a3b8" textAnchor="middle">Medidas en cm</text>
        </svg>
    );
}

function DiagramForType({ type }: { type: ClothingType }) {
    if (type === 'bottoms') return <BottomsDiagram />;
    if (type === 'dresses') return <DressDiagram />;
    if (type === 'footwear') return <FootwearDiagram />;
    if (type === 'kids' || type === 'babies') return <KidsDiagram />;
    if (type === 'underwear') return <TopsDiagram />;
    if (type === 'outerwear') return <TopsDiagram />;
    return <TopsDiagram />;
}

// ─── Legend ───────────────────────────────────────────────────────────────────

const NON_UNIT_KEYS = new Set(['edad', 'peso', 'mx', 'usa_w', 'usa_m', 'eur', 'uk', 'pie_cm']);

function unitSuffix(key: string, unit: 'cm' | 'in') {
    if (NON_UNIT_KEYS.has(key)) return '';
    return unit === 'cm' ? ' cm' : '"';
}

function convertVal(val: string, unit: 'cm' | 'in'): string {
    if (unit === 'cm') return val;
    return val.replace(/(\d+(?:\.\d+)?)/g, (m) => (Number(m) / 2.54).toFixed(1));
}

// ─── Public size-chart viewer ─────────────────────────────────────────────────

interface ClothingSizeChartProps {
    /** category from the listing */
    category?: string | null;
    /** subcategory from the listing */
    subcategory?: string | null;
    /** gender from the listing */
    gender?: string | null;
    /** custom size chart saved by the seller (from listing.attributes.custom_size_chart) */
    customChart?: CustomSizeChart | null;
}

export interface CustomSizeChart {
    /** optional title override */
    title?: string;
    /** column keys / labels */
    columns: { key: string; label: string }[];
    /** rows: size label + per-column measurement strings */
    rows: { size: string; values: Record<string, string> }[];
}

export function ClothingSizeChart({ category, subcategory, gender: _gender, customChart }: ClothingSizeChartProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [unit, setUnit] = useState<'cm' | 'in'>('cm');

    const clothingType = detectClothingType(category, subcategory);
    if (!clothingType && !customChart) return null;

    const defaultConfig = clothingType ? getChartConfig(clothingType) : null;

    // If seller provided a custom chart, use it; otherwise fall back to default
    const displayTitle = customChart?.title || defaultConfig?.title || 'Guía de Tallas';

    return (
        <div className="mt-6 overflow-hidden rounded-2xl border border-pink-100 bg-white shadow-sm">
            {/* Header */}
            <button
                type="button"
                onClick={() => setIsOpen((p) => !p)}
                className="flex w-full items-center justify-between px-5 py-4 text-left transition-colors hover:bg-pink-50/50"
            >
                <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-pink-500 to-[#c0005a] shadow-sm">
                        {/* Ruler icon */}
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M2 12h20M12 2v20M2 6h4M2 18h4M18 2v4M6 2v4M18 18v4M6 18v4" />
                            <rect x="2" y="2" width="20" height="20" rx="2" />
                        </svg>
                    </div>
                    <div>
                        <div className="text-sm font-bold text-gray-900">Guía de Tallas y Medidas</div>
                        <div className="text-xs text-gray-500">{displayTitle}</div>
                    </div>
                </div>
                <svg
                    width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                    className={`shrink-0 text-gray-400 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`}
                >
                    <polyline points="6 9 12 15 18 9" />
                </svg>
            </button>

            {isOpen && (
                <div className="border-t border-pink-100/70 px-5 pb-6 pt-5">
                    {/* Unit + intro */}
                    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                        <p className="text-xs text-gray-500">Mide tu cuerpo y compara con la tabla. Siempre mide sobre ropa interior.</p>
                        <div className="flex overflow-hidden rounded-lg border border-gray-200 text-xs font-semibold">
                            <button type="button" onClick={() => setUnit('cm')} className={`px-3 py-1.5 transition-colors ${unit === 'cm' ? 'bg-[#e3127d] text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>cm</button>
                            <button type="button" onClick={() => setUnit('in')} className={`px-3 py-1.5 transition-colors ${unit === 'in' ? 'bg-[#e3127d] text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>pulgadas</button>
                        </div>
                    </div>

                    {/* Diagram + Table */}
                    <div className="flex flex-col gap-6 md:flex-row md:items-start">
                        {/* Diagram */}
                        {clothingType && (
                            <div className="flex shrink-0 flex-col items-center md:w-44">
                                <div className="flex w-full items-center justify-center rounded-2xl bg-gradient-to-b from-pink-50/60 to-white p-3 ring-1 ring-pink-100">
                                    <DiagramForType type={clothingType} />
                                </div>
                                {/* Legend pills */}
                                {defaultConfig && !customChart && (
                                    <div className="mt-3 flex flex-wrap gap-1.5">
                                        {defaultConfig.measurementKeys.map((k, i) => (
                                            <span key={k.key} className="flex items-center gap-1 text-[10px] text-gray-600">
                                                <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[#e3127d] text-[8px] font-black text-white">{i + 1}</span>
                                                {k.label}
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Table */}
                        <div className="min-w-0 flex-1 overflow-x-auto">
                            {customChart ? (
                                // Custom seller table
                                <table className="w-full border-collapse text-xs">
                                    <thead>
                                        <tr className="bg-gradient-to-r from-[#c0005a] via-[#e3127d] to-[#ff4fa0]">
                                            <th className="rounded-tl-lg px-3 py-2.5 text-left font-bold text-white">Talla</th>
                                            {customChart.columns.map((col) => (
                                                <th key={col.key} className="px-3 py-2.5 text-left font-bold text-white last:rounded-tr-lg">{col.label}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {customChart.rows.map((row, idx) => (
                                            <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-pink-50/40'}>
                                                <td className="px-3 py-2 font-extrabold text-[#c0005a]">{row.size}</td>
                                                {customChart.columns.map((col) => (
                                                    <td key={col.key} className="px-3 py-2 tabular-nums text-gray-700">
                                                        {row.values[col.key] ?? '—'} {!NON_UNIT_KEYS.has(col.key) && row.values[col.key] ? unitSuffix(col.key, unit) : ''}
                                                    </td>
                                                ))}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            ) : defaultConfig ? (
                                // Default generic table
                                <table className="w-full border-collapse text-xs">
                                    <thead>
                                        <tr className="bg-gradient-to-r from-[#c0005a] via-[#e3127d] to-[#ff4fa0]">
                                            <th className="rounded-tl-lg px-3 py-2.5 text-left font-bold text-white">Talla</th>
                                            {defaultConfig.measurementKeys.map((k) => (
                                                <th key={k.key} className="px-3 py-2.5 text-left font-bold text-white last:rounded-tr-lg">{k.label}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {defaultConfig.sizes.map((row, idx) => (
                                            <tr key={`${row.size}-${idx}`} className={idx % 2 === 0 ? 'bg-white' : 'bg-pink-50/40'}>
                                                <td className="px-3 py-2 font-extrabold text-[#c0005a]">{row.size}</td>
                                                {defaultConfig.measurementKeys.map((k) => (
                                                    <td key={k.key} className="px-3 py-2 tabular-nums text-gray-700">
                                                        {convertVal(row.measurements[k.key] ?? '—', unit)}{unitSuffix(k.key, unit)}
                                                    </td>
                                                ))}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            ) : null}

                            {/* Tip box */}
                            <div className="mt-4 rounded-xl bg-blue-50 px-4 py-3 ring-1 ring-blue-100">
                                <div className="flex items-start gap-2">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="mt-0.5 shrink-0 text-blue-500" stroke="currentColor" strokeWidth="2">
                                        <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                                    </svg>
                                    <p className="text-xs text-blue-700">
                                        {clothingType === 'footwear'
                                            ? 'Traza tu pie sobre papel y mide desde el talón hasta el dedo más largo.'
                                            : clothingType === 'babies'
                                                ? 'Si el bebé está entre dos tallas, elige la mayor para mayor comodidad.'
                                                : 'Si estás entre dos tallas, elige la mayor. Las medidas son del cuerpo, no de la prenda.'}
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
