import { NextRequest, NextResponse } from 'next/server';
import { getT1Quotes } from '@/lib/shipping/t1-api';

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { origin_zip, dest_zip, weight_kg, length_cm, width_cm, height_cm, package_value, seller_plan } = body;

        if (!origin_zip || !dest_zip) {
            return NextResponse.json({ error: 'Se requieren los códigos postales de origen y destino' }, { status: 400 });
        }

        const quotes = await getT1Quotes({
            origin_zip,
            dest_zip,
            weight_kg: weight_kg || 1,
            length_cm: length_cm || 10,
            width_cm: width_cm || 10,
            height_cm: height_cm || 10,
            package_value: package_value || 0,
            seller_plan: seller_plan || 'basic',
        });

        return NextResponse.json({ success: true, quotes });
    } catch (err: any) {
        console.error('[API /shipping/t1/quote]', err);
        return NextResponse.json({ error: err?.message || 'Error al cotizar' }, { status: 500 });
    }
}
