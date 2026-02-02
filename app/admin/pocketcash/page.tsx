'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase/client';
import Link from 'next/link';

export default function AdminPocketCashPage() {
  const [activeTab, setActiveTab] = useState<'topups' | 'manage'>('topups');
  
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Gestión de PocketCash</h1>
        <div className="flex gap-2 rounded-lg bg-white p-1 shadow-sm border border-gray-200">
          <button
            onClick={() => setActiveTab('topups')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition ${
              activeTab === 'topups'
                ? 'bg-brand-pink text-white shadow-sm'
                : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            Recargas Pendientes
          </button>
          <button
            onClick={() => setActiveTab('manage')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition ${
              activeTab === 'manage'
                ? 'bg-brand-pink text-white shadow-sm'
                : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            Gestionar Saldos
          </button>
        </div>
      </div>

      {activeTab === 'topups' ? <PendingTopupsView /> : <ManageBalancesView />}
    </div>
  );
}

function PendingTopupsView() {
  const [topups, setTopups] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchTopups();
  }, []);

  async function fetchTopups() {
    try {
      setLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const res = await fetch('/api/admin/wallet/topups/list?status=pending', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al cargar recargas');
      
      // HACK: Parse metadata from mercadopago_preference_id if needed
      const parsedTopups = (data.topups || []).map((t: any) => {
        let metadata = t.metadata;
        if (!metadata && t.mercadopago_preference_id && t.mercadopago_preference_id.startsWith('{')) {
          try {
            metadata = JSON.parse(t.mercadopago_preference_id);
          } catch (e) { console.error(e); }
        }
        return { ...t, metadata };
      });
      
      setTopups(parsedTopups);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleApprove(topupId: string) {
    if (!confirm('¿Aprobar esta recarga y acreditar el saldo?')) return;
    try {
      setProcessingId(topupId);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const res = await fetch('/api/admin/wallet/topups/approve', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ topupId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al aprobar');
      
      alert('Recarga aprobada exitosamente');
      fetchTopups();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setProcessingId(null);
    }
  }

  async function handleReject(topupId: string) {
    if (!confirm('¿Rechazar esta recarga?')) return;
    try {
      setProcessingId(topupId);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const res = await fetch('/api/admin/wallet/topups/reject', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ topupId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al rechazar');
      
      alert('Recarga rechazada exitosamente');
      fetchTopups();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setProcessingId(null);
    }
  }

  if (loading) return <div className="p-8 text-center text-gray-500">Cargando recargas...</div>;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      {error && <div className="p-4 bg-red-50 text-red-600 border-b border-red-100">{error}</div>}
      
      {topups.length === 0 ? (
        <div className="p-12 text-center text-gray-500">
          No hay recargas pendientes de aprobación.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 font-semibold text-gray-900">Usuario</th>
                <th className="px-6 py-3 font-semibold text-gray-900">Monto</th>
                <th className="px-6 py-3 font-semibold text-gray-900">Método</th>
                <th className="px-6 py-3 font-semibold text-gray-900">Comprobante</th>
                <th className="px-6 py-3 font-semibold text-gray-900">Fecha</th>
                <th className="px-6 py-3 font-semibold text-gray-900 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {topups.map((t) => (
                <tr key={t.id} className="hover:bg-gray-50/50">
                  <td className="px-6 py-4">
                    <div className="font-medium text-gray-900">
                      {t.user?.first_name} {t.user?.last_name}
                    </div>
                    <div className="text-xs text-gray-500">{t.user?.email}</div>
                  </td>
                  <td className="px-6 py-4 font-mono font-medium text-green-600">
                    ${t.amount?.toFixed(2)}
                  </td>
                  <td className="px-6 py-4">
                    <span className="inline-flex items-center rounded-md bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700 ring-1 ring-inset ring-blue-700/10">
                      {t.metadata?.payment_method || 'Desconocido'}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    {t.metadata?.proof_url ? (
                      <a 
                        href={t.metadata.proof_url} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-brand-pink hover:underline text-xs font-medium"
                      >
                        Ver Comprobante
                      </a>
                    ) : (
                      <span className="text-gray-400 text-xs">-</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-gray-500">
                    {new Date(t.created_at).toLocaleDateString()} {new Date(t.created_at).toLocaleTimeString()}
                  </td>
                  <td className="px-6 py-4 text-right space-x-2">
                    <button
                      onClick={() => handleApprove(t.id)}
                      disabled={processingId === t.id}
                      className="inline-flex items-center justify-center rounded-lg bg-green-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-green-500 disabled:opacity-50"
                    >
                      {processingId === t.id ? '...' : 'Aprobar'}
                    </button>
                    <button
                      onClick={() => handleReject(t.id)}
                      disabled={processingId === t.id}
                      className="inline-flex items-center justify-center rounded-lg bg-white border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                    >
                      Rechazar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ManageBalancesView() {
  const [query, setQuery] = useState('');
  const [users, setUsers] = useState<any[]>([]);
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [wallet, setWallet] = useState<any>(null);
  const [searching, setSearching] = useState(false);
  
  // Action state
  const [actionAmount, setActionAmount] = useState('');
  const [actionReason, setActionReason] = useState('');
  const [actionType, setActionType] = useState<'credit' | 'debit'>('credit');
  const [processing, setProcessing] = useState(false);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    
    setSearching(true);
    setUsers([]);
    setSelectedUser(null);
    setWallet(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const res = await fetch(`/api/admin/users/search?q=${encodeURIComponent(query)}&limit=10`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const data = await res.json();
      if (res.ok) {
        setUsers(data.users || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSearching(false);
    }
  }

  async function selectUser(user: any) {
    setSelectedUser(user);
    setUsers([]);
    // Fetch wallet
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      
      const res = await fetch(`/api/admin/wallet/get-balance?userId=${user.id}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const data = await res.json();
      if (res.ok) {
        setWallet(data.wallet);
      }
    } catch (err) {
      console.error(err);
    }
  }

  async function executeAction() {
    if (!selectedUser || !actionAmount || !actionReason) {
      alert('Por favor completa todos los campos');
      return;
    }

    if (!confirm(`¿Estás seguro de ${actionType === 'credit' ? 'AGREGAR' : 'QUITAR'} $${actionAmount} a ${selectedUser.email}?`)) return;

    setProcessing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const res = await fetch('/api/admin/wallet/adjust', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          userId: selectedUser.id,
          amount: parseFloat(actionAmount),
          type: actionType,
          concept: actionReason
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error en la operación');

      alert('Operación exitosa');
      setActionAmount('');
      setActionReason('');
      
      // Refresh balance
      const balRes = await fetch(`/api/admin/wallet/get-balance?userId=${selectedUser.id}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const balData = await balRes.json();
      if (balRes.ok) {
        setWallet(balData.wallet);
      }

    } catch (err: any) {
      alert(err.message);
    } finally {
      setProcessing(false);
    }
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <div className="space-y-4">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Buscar Usuario</h2>
          <form onSubmit={handleSearch} className="flex gap-2">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Email, nombre o ID..."
              className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-pink focus:ring-1 focus:ring-brand-pink outline-none"
            />
            <button
              type="submit"
              disabled={searching}
              className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800 disabled:opacity-50"
            >
              {searching ? '...' : 'Buscar'}
            </button>
          </form>

          {users.length > 0 && (
            <div className="mt-4 divide-y divide-gray-100 border rounded-lg overflow-hidden">
              {users.map((u) => (
                <button
                  key={u.id}
                  onClick={() => selectUser(u)}
                  className="w-full text-left px-4 py-3 hover:bg-gray-50 flex items-center justify-between"
                >
                  <div>
                    <div className="font-medium text-gray-900">{u.name || u.full_name || 'Sin nombre'}</div>
                    <div className="text-xs text-gray-500">{u.email}</div>
                  </div>
                  <div className="text-gray-400">→</div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="space-y-4">
        {selectedUser ? (
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-gray-900">Acciones de Saldo</h2>
              <button onClick={() => setSelectedUser(null)} className="text-sm text-gray-500 hover:text-gray-700">Cambiar usuario</button>
            </div>

            <div className="mb-6 p-4 bg-gray-50 rounded-lg border border-gray-100">
              <div className="text-sm text-gray-500">Usuario seleccionado</div>
              <div className="font-medium text-gray-900">{selectedUser.name || selectedUser.full_name}</div>
              <div className="text-xs text-gray-500 font-mono">{selectedUser.email}</div>
              <div className="text-xs text-gray-400 mt-1">ID: {selectedUser.id}</div>
              
              {wallet && (
                <div className="mt-4 pt-4 border-t border-gray-200">
                  <div className="text-sm text-gray-500">Saldo actual</div>
                  <div className="text-2xl font-bold text-gray-900">${Number(wallet.balance || 0).toFixed(2)}</div>
                  {wallet.is_frozen && (
                    <span className="inline-flex items-center rounded-md bg-red-50 px-2 py-1 text-xs font-medium text-red-700 ring-1 ring-inset ring-red-600/10 mt-2">
                      Monedero Congelado
                    </span>
                  )}
                </div>
              )}
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setActionType('credit')}
                  className={`py-2 px-3 rounded-lg text-sm font-medium border ${
                    actionType === 'credit'
                      ? 'bg-green-50 border-green-200 text-green-700 ring-1 ring-green-500'
                      : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  + Agregar (Crédito)
                </button>
                <button
                  onClick={() => setActionType('debit')}
                  className={`py-2 px-3 rounded-lg text-sm font-medium border ${
                    actionType === 'debit'
                      ? 'bg-red-50 border-red-200 text-red-700 ring-1 ring-red-500'
                      : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  - Quitar (Débito)
                </button>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Monto (MXN)</label>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={actionAmount}
                  onChange={(e) => setActionAmount(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-pink focus:ring-1 focus:ring-brand-pink outline-none"
                  placeholder="0.00"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Concepto / Motivo</label>
                <input
                  type="text"
                  value={actionReason}
                  onChange={(e) => setActionReason(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-pink focus:ring-1 focus:ring-brand-pink outline-none"
                  placeholder="Ej: Regalo de bienvenida, Ajuste por error..."
                />
              </div>

              <button
                onClick={executeAction}
                disabled={processing || !actionAmount || !actionReason}
                className={`w-full py-2.5 rounded-lg text-sm font-bold text-white shadow-sm transition ${
                  actionType === 'credit' ? 'bg-green-600 hover:bg-green-500' : 'bg-red-600 hover:bg-red-500'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                {processing ? 'Procesando...' : actionType === 'credit' ? 'Confirmar Crédito' : 'Confirmar Débito'}
              </button>
            </div>
          </div>
        ) : (
          <div className="h-full flex items-center justify-center p-8 border-2 border-dashed border-gray-200 rounded-xl text-gray-400 text-sm">
            Selecciona un usuario para gestionar su saldo
          </div>
        )}
      </div>
    </div>
  );
}
