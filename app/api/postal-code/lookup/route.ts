import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * Busca información de código postal usando la API de SEPOMEX
 * Endpoint: https://sepomex.nitrostudio.com.mx/api/v1/codigo_postal/{cp}
 */
export async function GET(req: NextRequest) {
  try {
    const cp = req.nextUrl.searchParams.get('cp');
    if (!cp || !/^\d{5}$/.test(cp)) {
      return NextResponse.json({ error: 'Código postal inválido. Debe tener 5 dígitos.' }, { status: 400 });
    }

    // Intentar múltiples APIs en orden de preferencia
    // 1. API de SEPOMEX Nitrostudio (formato JSON directo)
    const sepomexUrl = `https://sepomex.nitrostudio.com.mx/api/v1/codigo_postal/${cp}.json`;
    console.log('[POSTAL CODE LOOKUP] Consultando SEPOMEX:', sepomexUrl);
    
    let response: Response | null = null;
    try {
      response = await fetch(sepomexUrl, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
      });
      console.log('[POSTAL CODE LOOKUP] Response status:', response.status, response.statusText);
    } catch (fetchErr) {
      console.error('[POSTAL CODE LOOKUP] Error al consultar SEPOMEX:', fetchErr);
      response = null;
    }

    if (!response || !response.ok) {
      console.error('[POSTAL CODE LOOKUP] SEPOMEX API failed:', response?.status, response?.statusText);
      
      // Intentar con API alternativa más confiable
      try {
        // API de mexico-zipcodes (más confiable)
        const mexicoZipUrl = `https://mexico-zipcodes.herokuapp.com/api/v1/zipcode/${cp}`;
        console.log('[POSTAL CODE LOOKUP] Intentando mexico-zipcodes:', mexicoZipUrl);
        const mexicoZipResponse = await fetch(mexicoZipUrl, {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
          },
        });
        
        if (mexicoZipResponse.ok) {
          const mexicoZipData = await mexicoZipResponse.json();
          console.log('[POSTAL CODE LOOKUP] Respuesta mexico-zipcodes:', { data: mexicoZipData });
          
          if (mexicoZipData && (mexicoZipData.estado || mexicoZipData.municipio)) {
            const colonias = Array.isArray(mexicoZipData.colonias) 
              ? mexicoZipData.colonias.map((c: any) => ({
                  nombre: String(c.nombre || c || '').trim(),
                  tipo: String(c.tipo || '').trim(),
                }))
              : [];
            
            return NextResponse.json({
              ok: true,
              estado: String(mexicoZipData.estado || '').trim(),
              municipio: String(mexicoZipData.municipio || '').trim(),
              colonias: colonias.filter((c: { nombre: string; tipo: string }) => c.nombre),
            });
          }
        }
      } catch (altErr) {
        console.error('[POSTAL CODE LOOKUP] Error en mexico-zipcodes:', altErr);
      }
      
      // Intentar con API alternativa: Django Postal Codes Mexico
      try {
        const altUrl = `https://api-sepomex.hckdrk.me/api/v1/codigo_postal/${cp}`;
        console.log('[POSTAL CODE LOOKUP] Intentando API alternativa:', altUrl);
        const altResponse = await fetch(altUrl, {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
          },
        });
        
        if (altResponse.ok) {
          const altData = await altResponse.json();
          console.log('[POSTAL CODE LOOKUP] Respuesta API alternativa:', { data: altData });
          
          // Procesar respuesta de API alternativa
          if (altData && (altData.estado || altData.municipio || Array.isArray(altData))) {
            let estado = '';
            let municipio = '';
            let colonias: Array<{ nombre: string; tipo: string }> = [];
            
            if (Array.isArray(altData)) {
              if (altData.length > 0) {
                estado = String(altData[0]?.estado || altData[0]?.d_estado || '').trim();
                municipio = String(altData[0]?.municipio || altData[0]?.d_mnpio || '').trim();
                colonias = altData
                  .map((item: any) => ({
                    nombre: String(item?.colonia || item?.asentamiento || item?.d_asenta || '').trim(),
                    tipo: String(item?.tipo || item?.tipo_asentamiento || item?.d_tipo_asenta || '').trim(),
                  }))
                  .filter((c: any) => c.nombre);
              }
            } else if (altData.estado || altData.municipio) {
              estado = String(altData.estado || '').trim();
              municipio = String(altData.municipio || '').trim();
              if (Array.isArray(altData.colonias)) {
                colonias = altData.colonias.map((c: any) => ({
                  nombre: String(c.nombre || c || '').trim(),
                  tipo: String(c.tipo || '').trim(),
                })).filter((c: any) => c.nombre);
              }
            }
            
            if (estado || municipio) {
              return NextResponse.json({
                ok: true,
                estado,
                municipio,
                colonias: colonias.filter((c: { nombre: string; tipo: string }) => c.nombre),
              });
            }
          }
        }
      } catch (altErr) {
        console.error('[POSTAL CODE LOOKUP] Error en API alternativa:', altErr);
      }
      
      // Intentar con micodigopostal.org
      try {
        const micodigoUrl = `https://codigospostales.satch.tk/api/v1/${cp}`;
        console.log('[POSTAL CODE LOOKUP] Intentando micodigopostal.org (codigospostales.satch.tk):', micodigoUrl);
        const micodigoResponse = await fetch(micodigoUrl, {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
          },
        });
        
        if (micodigoResponse.ok) {
          const micodigoData = await micodigoResponse.json();
          console.log('[POSTAL CODE LOOKUP] Respuesta micodigopostal:', { data: micodigoData });
          
          if (micodigoData && (micodigoData.estado || micodigoData.municipio || Array.isArray(micodigoData))) {
            let estado = '';
            let municipio = '';
            let colonias: Array<{ nombre: string; tipo: string }> = [];
            
            if (Array.isArray(micodigoData)) {
              if (micodigoData.length > 0) {
                estado = String(micodigoData[0]?.estado || micodigoData[0]?.d_estado || '').trim();
                municipio = String(micodigoData[0]?.municipio || micodigoData[0]?.d_mnpio || '').trim();
                colonias = micodigoData
                  .map((item: any) => ({
                    nombre: String(item?.colonia || item?.asentamiento || item?.d_asenta || '').trim(),
                    tipo: String(item?.tipo || item?.tipo_asentamiento || item?.d_tipo_asenta || '').trim(),
                  }))
                  .filter((c: any) => c.nombre);
              }
            } else if (micodigoData.estado || micodigoData.municipio) {
              estado = String(micodigoData.estado || '').trim();
              municipio = String(micodigoData.municipio || '').trim();
              if (Array.isArray(micodigoData.colonias)) {
                colonias = micodigoData.colonias.map((c: any) => ({
                  nombre: String(c.nombre || c || '').trim(),
                  tipo: String(c.tipo || '').trim(),
                })).filter((c: any) => c.nombre);
              }
            }
            
            if (estado || municipio) {
              return NextResponse.json({
                ok: true,
                estado,
                municipio,
                colonias: colonias.filter((c: { nombre: string; tipo: string }) => c.nombre),
              });
            }
          }
        }
      } catch (micodigoErr) {
        console.error('[POSTAL CODE LOOKUP] Error en micodigopostal.org:', micodigoErr);
      }
      
      // Intentar con Estafeta (página oficial de frecuencia de entregas)
      try {
        // Intentar posibles endpoints de Estafeta
        const estafetaEndpoints = [
          `https://www.estafeta.com/api/codigo-postal/${cp}`,
          `https://www.estafeta.com/api/v1/codigo-postal/${cp}`,
          `https://www.estafeta.com/frecuencia-de-entregas/api/${cp}`,
          `https://api.estafeta.com/codigo-postal/${cp}`,
        ];
        
        for (const estafetaUrl of estafetaEndpoints) {
          try {
            console.log('[POSTAL CODE LOOKUP] Intentando Estafeta:', estafetaUrl);
            const estafetaResponse = await fetch(estafetaUrl, {
              method: 'GET',
              headers: {
                'Accept': 'application/json',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
              },
            });
            
            if (estafetaResponse.ok) {
              const contentType = estafetaResponse.headers.get('content-type');
              if (contentType && contentType.includes('application/json')) {
                const estafetaData = await estafetaResponse.json();
                console.log('[POSTAL CODE LOOKUP] Respuesta Estafeta:', { data: estafetaData });
                
                if (estafetaData && (estafetaData.estado || estafetaData.municipio)) {
                  const colonias = Array.isArray(estafetaData.colonias) 
                    ? estafetaData.colonias.map((c: any) => ({
                        nombre: String(c.nombre || c || '').trim(),
                        tipo: String(c.tipo || '').trim(),
                      }))
                    : [];
                  
                  return NextResponse.json({
                    ok: true,
                    estado: String(estafetaData.estado || '').trim(),
                    municipio: String(estafetaData.municipio || '').trim(),
                    colonias: colonias.filter((c: { nombre: string; tipo: string }) => c.nombre),
                  });
                }
              }
            }
          } catch (estafetaErr) {
            // Continuar con siguiente endpoint
            continue;
          }
        }
      } catch (estafetaErr) {
        console.error('[POSTAL CODE LOOKUP] Error en Estafeta:', estafetaErr);
      }
      
      // Intentar con zonaextendida.com (si tiene API o endpoint)
      try {
        const zonaExtendidaUrl = `https://zonaextendida.com/api/cp/${cp}`;
        console.log('[POSTAL CODE LOOKUP] Intentando zonaextendida.com:', zonaExtendidaUrl);
        const zonaResponse = await fetch(zonaExtendidaUrl, {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
          },
        });
        
        if (zonaResponse.ok) {
          const zonaData = await zonaResponse.json();
          if (zonaData?.estado && zonaData?.municipio) {
            return NextResponse.json({
              ok: true,
              estado: zonaData.estado,
              municipio: zonaData.municipio,
              colonias: Array.isArray(zonaData.colonias) ? zonaData.colonias : [],
            });
          }
        }
      } catch {
        // Continuar con siguiente opción
      }
      
      // Intentar con COPOMEX como último recurso
      try {
        const copomexUrl = `https://api.copomex.com/query/info_cp/${cp}?token=pruebas`;
        const copomexResponse = await fetch(copomexUrl, {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
          },
        });
        
        if (copomexResponse.ok) {
          const copomexData = await copomexResponse.json();
          if (copomexData?.response?.estado && copomexData?.response?.municipio) {
            const colonias = Array.isArray(copomexData.response?.asentamiento) 
              ? copomexData.response.asentamiento.map((a: any) => ({
                  nombre: String(a?.asentamiento || '').trim(),
                  tipo: String(a?.tipo_asentamiento || '').trim(),
                }))
              : [];
            
            return NextResponse.json({
              ok: true,
              estado: copomexData.response.estado,
              municipio: copomexData.response.municipio,
              colonias: colonias.filter((c: any) => c.nombre),
            });
          }
        }
      } catch {
        // Continuar con error
      }
      
      return NextResponse.json({ error: 'No se pudo obtener información del código postal.' }, { status: 500 });
    }

    const data = await response.json().catch((err) => {
      console.error('[POSTAL CODE LOOKUP] Error parsing JSON:', err);
      return null;
    });
    
    console.log('[POSTAL CODE LOOKUP] Response data:', { cp, dataLength: data?.length, sample: data?.[0], fullData: JSON.stringify(data).substring(0, 500) });
    
    if (!data) {
      console.error('[POSTAL CODE LOOKUP] No data returned for CP:', cp);
      return NextResponse.json({ error: 'No se recibió respuesta de la API.' }, { status: 500 });
    }
    
    // La API puede devolver un objeto con un array o directamente un array
    let items: any[] = [];
    if (Array.isArray(data)) {
      items = data;
    } else if (data && typeof data === 'object' && Array.isArray(data.data)) {
      items = data.data;
    } else if (data && typeof data === 'object' && data.response && Array.isArray(data.response)) {
      items = data.response;
    } else if (data && typeof data === 'object' && data.codigo_postal) {
      // Si es un objeto único, convertirlo a array
      items = [data];
    }
    
    if (items.length === 0) {
      console.error('[POSTAL CODE LOOKUP] No items found for CP:', cp);
      return NextResponse.json({ error: 'Código postal no encontrado.' }, { status: 404 });
    }

    // Extraer estado y municipio del primer resultado
    // La API de SEPOMEX Nitrostudio usa: d_estado, d_mnpio, d_asenta, d_tipo_asenta
    const first = items[0];
    const estado = String(
      first?.d_estado || 
      first?.estado || 
      first?.estado_nombre || 
      first?.response?.estado ||
      ''
    ).trim();
    const municipio = String(
      first?.d_mnpio || 
      first?.municipio || 
      first?.municipio_nombre || 
      first?.ciudad ||
      first?.d_ciudad ||
      first?.response?.municipio ||
      ''
    ).trim();
    
    console.log('[POSTAL CODE LOOKUP] Extracted:', { 
      cp, 
      estado, 
      municipio, 
      coloniasCount: items.length, 
      firstItemKeys: Object.keys(first || {}),
      firstItem: JSON.stringify(first).substring(0, 300)
    });

    // Extraer todas las colonias únicas
    const coloniasMap = new Map<string, { nombre: string; tipo: string }>();
    for (const item of items) {
      const nombre = String(
        item?.d_asenta || 
        item?.asentamiento || 
        item?.colonia || 
        item?.asentamiento_nombre ||
        item?.response?.asentamiento ||
        ''
      ).trim();
      const tipo = String(
        item?.d_tipo_asenta || 
        item?.tipo_asentamiento || 
        item?.tipo || 
        item?.tipo_asentamiento_nombre ||
        item?.response?.tipo_asentamiento ||
        ''
      ).trim();
      if (nombre && !coloniasMap.has(nombre)) {
        coloniasMap.set(nombre, { nombre, tipo });
      }
    }

    const colonias = Array.from(coloniasMap.values()).sort((a, b) => a.nombre.localeCompare(b.nombre));

    const resp = NextResponse.json({
      ok: true,
      estado,
      municipio,
      colonias,
    });
    resp.headers.set('Cache-Control', 'public, max-age=86400'); // Cache por 24 horas
    return resp;
  } catch (e: unknown) {
    console.error('[POSTAL CODE LOOKUP] Error:', e);
    const resp = NextResponse.json({ error: e instanceof Error ? e.message : 'Error inesperado' }, { status: 500 });
    resp.headers.set('Cache-Control', 'no-store, max-age=0');
    return resp;
  }
}
