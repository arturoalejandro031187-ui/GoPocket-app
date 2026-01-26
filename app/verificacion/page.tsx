'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase/client';

type ProfileRow = {
  full_name: string;
  address_street: string;
  ext_number: string;
  int_number: string;
  neighborhood: string;
  zip_code: string;
  state: string;
  city: string;
  references: string;
  cross_streets: string;
  phone: string;
  ine_front_url: string;
  ine_back_url: string;
};

type UploadResult = { url: string };

async function uploadFile(file: File): Promise<string> {
  const fd = new FormData();
  fd.append('file', file);
  fd.append('kind', 'verification');
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const res = await fetch('/api/upload', {
    method: 'POST',
    headers: token ? { authorization: `Bearer ${token}` } : undefined,
    body: fd,
  });
  const json = (await res.json().catch(() => ({}))) as Partial<UploadResult> & { error?: string };
  if (!res.ok) throw new Error(json?.error || 'No se pudo subir la imagen.');
  if (!json?.url) throw new Error('Respuesta inválida del servidor de upload.');
  return json.url;
}

function isFilled(value: string) {
  return value.trim().length > 0;
}

export default function VerificacionPage() {
  const [isBooting, setIsBooting] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isVerified, setIsVerified] = useState(false);

  const [email, setEmail] = useState<string>('');
  const [ineFrontFile, setIneFrontFile] = useState<File | null>(null);
  const [ineBackFile, setIneBackFile] = useState<File | null>(null);

  const [form, setForm] = useState<ProfileRow>({
    full_name: '',
    address_street: '',
    ext_number: '',
    int_number: '',
    neighborhood: '',
    zip_code: '',
    state: '',
    city: '',
    references: '',
    cross_streets: '',
    phone: '',
    ine_front_url: '',
    ine_back_url: '',
  });

  const canSave = useMemo(() => {
    return (
      isFilled(email) &&
      isFilled(form.full_name) &&
      isFilled(form.phone) &&
      isFilled(form.address_street) &&
      isFilled(form.ext_number) &&
      isFilled(form.int_number) &&
      isFilled(form.neighborhood) &&
      isFilled(form.zip_code) &&
      isFilled(form.state) &&
      isFilled(form.city) &&
      isFilled(form.references) &&
      isFilled(form.cross_streets) &&
      (isFilled(form.ine_front_url) || Boolean(ineFrontFile)) &&
      (isFilled(form.ine_back_url) || Boolean(ineBackFile)) &&
      !isSaving
    );
  }, [email, form, ineFrontFile, ineBackFile, isSaving]);

  useEffect(() => {
    let cancelled = false;

    const boot = async () => {
      try {
        setIsBooting(true);
        setError(null);

        const { data: userData, error: userErr } = await supabase.auth.getUser();
        if (userErr) throw userErr;
        if (!userData.user) {
          window.location.href = '/';
          return;
        }
        if (!cancelled) setEmail(String(userData.user.email ?? '').trim());

        const { data: profile, error: profileErr } = await supabase
          .from('profiles')
          .select(
            'full_name,address_street,ext_number,int_number,neighborhood,zip_code,state,city,references,cross_streets,phone,ine_front_url,ine_back_url,is_verified',
          )
          .eq('id', userData.user.id)
          .maybeSingle();

        // Verificar si ya está verificado
        if (profile?.is_verified) {
          if (!cancelled) setIsVerified(true);
        }

        if (profileErr) {
          const anyErr = profileErr as any;
          const code = String(anyErr?.code || '');
          const msg = String(anyErr?.message || '');
          if (code === '42703' && msg.includes('ine_front_url')) {
            throw new Error(
              "Tu tabla `profiles` no tiene las columnas `ine_front_url` y `ine_back_url`. " +
                "Ejecuta el SQL `supabase_profiles_ine_migration.sql` en Supabase (SQL Editor) y vuelve a intentar.",
            );
          }
          if (code === '42703' && msg.includes('address_street')) {
            throw new Error(
              "Tu tabla `profiles` no tiene columnas de dirección (por ejemplo `address_street`). " +
                "Ejecuta el SQL `supabase_profiles_address_migration.sql` en Supabase (SQL Editor) y vuelve a intentar.",
            );
          }
          throw profileErr;
        }
        if (!cancelled && profile) {
          setForm({
            full_name: (profile as any).full_name ?? '',
            address_street: (profile as any).address_street ?? '',
            ext_number: (profile as any).ext_number ?? '',
            int_number: (profile as any).int_number ?? '',
            neighborhood: (profile as any).neighborhood ?? '',
            zip_code: (profile as any).zip_code ?? '',
            state: (profile as any).state ?? '',
            city: (profile as any).city ?? '',
            references: (profile as any).references ?? '',
            cross_streets: (profile as any).cross_streets ?? '',
            phone: (profile as any).phone ?? '',
            ine_front_url: (profile as any).ine_front_url ?? '',
            ine_back_url: (profile as any).ine_back_url ?? '',
          });
        }
      } catch (err: unknown) {
        console.error(err);
        if (!cancelled) setError(err instanceof Error ? err.message : 'No se pudo cargar tu perfil.');
      } finally {
        if (!cancelled) setIsBooting(false);
      }
    };

    void boot();
    return () => {
      cancelled = true;
    };
  }, []);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    try {
      setIsSaving(true);
      const { data: userData, error: userErr } = await supabase.auth.getUser();
      if (userErr) throw userErr;
      const user = userData.user;
      if (!user) {
        window.location.href = '/';
        return;
      }

      let frontUrl = form.ine_front_url;
      let backUrl = form.ine_back_url;

      if (ineFrontFile) frontUrl = await uploadFile(ineFrontFile);
      if (ineBackFile) backUrl = await uploadFile(ineBackFile);

      const payload = {
        full_name: form.full_name.trim(),
        address_street: form.address_street.trim(),
        ext_number: form.ext_number.trim(),
        int_number: form.int_number.trim(),
        neighborhood: form.neighborhood.trim(),
        zip_code: form.zip_code.trim(),
        state: form.state.trim(),
        city: form.city.trim(),
        references: form.references.trim(),
        cross_streets: form.cross_streets.trim(),
        phone: form.phone.trim(),
        ine_front_url: frontUrl.trim(),
        ine_back_url: backUrl.trim(),
      };

      const { error: updErr } = await supabase.from('profiles').update(payload).eq('id', user.id);
      if (updErr) throw updErr;

      setSuccess('Verificación guardada. Ya puedes vender.');
      setTimeout(() => {
        window.location.href = '/sell';
      }, 900);
    } catch (err: unknown) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'No se pudo guardar tu verificación.');
    } finally {
      setIsSaving(false);
    }
  };


  if (isBooting) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-pink-50 to-white">
        <div className="mx-auto max-w-3xl px-4 py-10">
          <div className="h-14 rounded-2xl bg-white/70 ring-1 ring-black/5" />
          <div className="mt-6 h-96 rounded-2xl bg-white/70 ring-1 ring-black/5" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-pink-50 to-white">
      <div className="sticky top-0 z-40 border-b border-black/5 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 items-center justify-center rounded-xl bg-brand-pink px-3 text-white shadow-sm">
              <span className="text-sm font-extrabold tracking-widest">GoPocket</span>
            </div>
            <div className="leading-tight">
              <div className="text-sm font-semibold text-gray-900">Verificación</div>
              <div className="text-xs text-gray-500">Requerida para vender</div>
            </div>
          </div>
          <Link
            href="/dashboard"
            className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-black/5 hover:bg-gray-50"
          >
            Volver
          </Link>
        </div>
      </div>

      <main className="mx-auto max-w-3xl px-4 py-10">
        <div className="mb-6">
          <div className="inline-flex items-center gap-2 rounded-full bg-pink-50 px-3 py-1 text-xs font-semibold text-brand-pink ring-1 ring-pink-100">
            Paso obligatorio
          </div>
          <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-gray-900">Completa tu verificación</h1>
          <p className="mt-2 text-sm text-gray-600">
            Necesitamos tu dirección y tu INE (frente y reverso) para habilitar ventas y generar guías de envío.
          </p>
        </div>

        {isVerified && (
          <div className="mb-6 rounded-2xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
            ✅ Ya estás verificado. Puedes vender productos en la plataforma.
          </div>
        )}


        {!isBooting && !email.trim() && (
          <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            El <span className="font-semibold">email</span> de tu cuenta es obligatorio para poder vender o publicar. Si no lo tienes configurado, actualízalo en <Link href="/dashboard/perfil" className="font-semibold text-brand-pink underline">Mi perfil</Link> y vuelve aquí.
          </div>
        )}
        {error && (
          <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </div>
        )}
        {success && (
          <div className="mb-6 rounded-2xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
            {success}
          </div>
        )}

        <form onSubmit={onSubmit} className="space-y-6">
          <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-black/5 sm:p-8">
            <h2 className="text-lg font-bold text-gray-900">Datos de dirección</h2>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-gray-700">Email <span className="text-red-600">*</span></label>
                <input
                  type="email"
                  value={email}
                  readOnly
                  className="mt-1 w-full rounded-xl border border-gray-300 bg-gray-50 px-4 py-3 text-sm text-gray-600 outline-none"
                  placeholder="Correo de tu cuenta"
                />
                <div className="mt-1 text-xs text-gray-500">Obligatorio. Configúralo en Mi perfil si falta.</div>
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-gray-700">Nombre completo</label>
                <input
                  value={form.full_name}
                  onChange={(e) => setForm((p) => ({ ...p, full_name: e.target.value }))}
                  className="mt-1 w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none focus:border-transparent focus:ring-2 focus:ring-brand-pink"
                  required
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-gray-700">Calle</label>
                <input
                  value={form.address_street}
                  onChange={(e) => setForm((p) => ({ ...p, address_street: e.target.value }))}
                  className="mt-1 w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none focus:border-transparent focus:ring-2 focus:ring-brand-pink"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Número exterior</label>
                <input
                  value={form.ext_number}
                  onChange={(e) => setForm((p) => ({ ...p, ext_number: e.target.value }))}
                  className="mt-1 w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none focus:border-transparent focus:ring-2 focus:ring-brand-pink"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Número interior</label>
                <input
                  value={form.int_number}
                  onChange={(e) => setForm((p) => ({ ...p, int_number: e.target.value }))}
                  className="mt-1 w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none focus:border-transparent focus:ring-2 focus:ring-brand-pink"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Colonia</label>
                <input
                  value={form.neighborhood}
                  onChange={(e) => setForm((p) => ({ ...p, neighborhood: e.target.value }))}
                  className="mt-1 w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none focus:border-transparent focus:ring-2 focus:ring-brand-pink"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Código postal</label>
                <input
                  value={form.zip_code}
                  onChange={(e) => setForm((p) => ({ ...p, zip_code: e.target.value }))}
                  className="mt-1 w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none focus:border-transparent focus:ring-2 focus:ring-brand-pink"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Estado</label>
                <input
                  value={form.state}
                  onChange={(e) => setForm((p) => ({ ...p, state: e.target.value }))}
                  className="mt-1 w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none focus:border-transparent focus:ring-2 focus:ring-brand-pink"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Municipio</label>
                <input
                  value={form.city}
                  onChange={(e) => setForm((p) => ({ ...p, city: e.target.value }))}
                  className="mt-1 w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none focus:border-transparent focus:ring-2 focus:ring-brand-pink"
                  required
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-gray-700">Entre calles</label>
                <input
                  value={form.cross_streets}
                  onChange={(e) => setForm((p) => ({ ...p, cross_streets: e.target.value }))}
                  className="mt-1 w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none focus:border-transparent focus:ring-2 focus:ring-brand-pink"
                  required
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-gray-700">Referencias</label>
                <input
                  value={form.references}
                  onChange={(e) => setForm((p) => ({ ...p, references: e.target.value }))}
                  className="mt-1 w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none focus:border-transparent focus:ring-2 focus:ring-brand-pink"
                  required
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-gray-700">Teléfono</label>
                <input
                  value={form.phone}
                  onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
                  className="mt-1 w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none focus:border-transparent focus:ring-2 focus:ring-brand-pink"
                  required
                />
              </div>
            </div>
          </section>

          <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-black/5 sm:p-8">
            <h2 className="text-lg font-bold text-gray-900">INE (Frente y reverso)</h2>
            <p className="mt-1 text-sm text-gray-600">Puedes subir archivo o usar cámara en celular.</p>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-gray-700">INE Frente</label>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={(e) => setIneFrontFile(e.target.files?.[0] ?? null)}
                  className="mt-1 w-full rounded-xl border border-gray-300 px-4 py-3 text-sm file:mr-4 file:rounded-xl file:border-0 file:bg-brand-pink file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:opacity-90"
                />
                {isFilled(form.ine_front_url) && (
                  <div className="mt-2 text-xs text-gray-500">Ya tienes INE frente guardado.</div>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">INE Reverso</label>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={(e) => setIneBackFile(e.target.files?.[0] ?? null)}
                  className="mt-1 w-full rounded-xl border border-gray-300 px-4 py-3 text-sm file:mr-4 file:rounded-xl file:border-0 file:bg-brand-pink file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:opacity-90"
                />
                {isFilled(form.ine_back_url) && (
                  <div className="mt-2 text-xs text-gray-500">Ya tienes INE reverso guardado.</div>
                )}
              </div>
            </div>
          </section>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={!canSave}
              className="rounded-xl bg-brand-pink px-6 py-3 text-sm font-semibold text-white shadow-lg hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSaving ? 'Guardando…' : 'Guardar verificación'}
            </button>
          </div>
          </form>
        )}
      </main>
    </div>
  );
}

