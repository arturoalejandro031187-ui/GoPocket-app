'use client';

import { useEffect, useState, useCallback } from 'react';
import { usePathname } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';

export type TourStep = {
  id: string;
  target: string; // selector CSS del elemento a destacar
  title: string;
  content: string; // Explicación super sencilla
  position?: 'top' | 'bottom' | 'left' | 'right';
};

type PageTourProps = {
  steps: TourStep[];
  pageId: string; // Identificador único de la página (ej: 'ventas', 'compras')
};

export function PageTour({ steps, pageId }: PageTourProps) {
  const [isActive, setIsActive] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [userId, setUserId] = useState<string | null>(null);
  const [targetElement, setTargetElement] = useState<Element | null>(null);
  const pathname = usePathname();

  useEffect(() => {
    const checkTourStatus = async () => {
      try {
        const { data: userData } = await supabase.auth.getUser();
        if (!userData.user) return;

        const uid = userData.user.id;
        setUserId(uid);

        // Verificar si el tour está desactivado globalmente
        const { data: profile } = await supabase
          .from('profiles')
          .select('has_seen_onboarding_tour')
          .eq('id', uid)
          .maybeSingle();

        // Si el tour está desactivado globalmente (true), no mostrar
        // Si es null o false, el tour está activo y se muestra
        if (profile?.has_seen_onboarding_tour === true) {
          return;
        }

        // Verificar si el usuario ya vio el tour de esta página específica
        const hasSeenPageTour = localStorage.getItem(`pocket_tour_${pageId}_${uid}`);
        if (hasSeenPageTour === 'true') {
          return;
        }

        // Esperar un poco para que la página cargue completamente
        setTimeout(() => {
          setIsActive(true);
        }, 800);
      } catch (err) {
        console.error('[PageTour] Error:', err);
      }
    };

    void checkTourStatus();
  }, [pageId, pathname]);

  const markTourAsSeen = useCallback(async () => {
    if (!userId) return;

    try {
      // Guardar en localStorage que el usuario vio el tour de esta página
      localStorage.setItem(`pocket_tour_${pageId}_${userId}`, 'true');
      setIsActive(false);
    } catch (err) {
      console.error('[PageTour] Error al marcar tour como visto:', err);
      setIsActive(false);
    }
  }, [userId, pageId]);

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      void markTourAsSeen();
    }
  };

  const handleSkip = () => {
    void markTourAsSeen();
  };

  const handlePrevious = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const step = steps[currentStep];

  // Buscar el elemento objetivo cuando cambia el paso
  useEffect(() => {
    if (!isActive) return;
    if (typeof document === 'undefined') return;
    if (!step) return;

    const element = document.querySelector(step.target);
    setTargetElement(element);

    if (!element && step.target !== 'body') {
      // Si el elemento no existe, esperar un poco y avanzar al siguiente paso
      const timer = setTimeout(() => {
        if (currentStep < steps.length - 1) {
          setCurrentStep(currentStep + 1);
        } else {
          markTourAsSeen();
        }
      }, 500);
      return () => clearTimeout(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStep, isActive, step]);

  if (!isActive || !step || steps.length === 0) return null;

  const rect = targetElement && targetElement !== document.body 
    ? targetElement.getBoundingClientRect()
    : { top: window.innerHeight / 2, left: window.innerWidth / 2, width: 0, height: 0, right: 0, bottom: 0 };

  const getTooltipPosition = () => {
    const spacing = 20;
    const tooltipWidth = 320;
    const tooltipHeight = 180;

    switch (step.position) {
      case 'top':
        return {
          top: rect.top - tooltipHeight - spacing,
          left: rect.left + rect.width / 2 - tooltipWidth / 2,
        };
      case 'bottom':
        return {
          top: rect.bottom + spacing,
          left: rect.left + rect.width / 2 - tooltipWidth / 2,
        };
      case 'left':
        return {
          top: rect.top + rect.height / 2 - tooltipHeight / 2,
          left: rect.left - tooltipWidth - spacing,
        };
      case 'right':
        return {
          top: rect.top + rect.height / 2 - tooltipHeight / 2,
          left: rect.right + spacing,
        };
      default:
        return {
          top: rect.bottom + spacing,
          left: rect.left + rect.width / 2 - tooltipWidth / 2,
        };
    }
  };

  const tooltipPos = getTooltipPosition();

  return (
    <>
      {/* Overlay oscuro */}
      <div
        className="fixed inset-0 z-[9998] bg-black/60 transition-opacity"
        onClick={handleSkip}
        style={{ pointerEvents: 'auto' }}
      />

      {/* Highlight del elemento objetivo */}
      {targetElement && targetElement !== document.body && (
        <div
          className="fixed z-[9999] rounded-lg border-4 border-brand-pink shadow-[0_0_0_9999px_rgba(0,0,0,0.6)] transition-all"
          style={{
            top: `${rect.top}px`,
            left: `${rect.left}px`,
            width: `${rect.width}px`,
            height: `${rect.height}px`,
            pointerEvents: 'none',
          }}
        />
      )}

      {/* Tooltip */}
      <div
        className="fixed z-[10000] w-80 rounded-2xl bg-white p-5 shadow-2xl ring-2 ring-brand-pink/20"
        style={{
          top: `${Math.max(20, Math.min(tooltipPos.top, window.innerHeight - 250))}px`,
          left: `${Math.max(20, Math.min(tooltipPos.left, window.innerWidth - 340))}px`,
        }}
      >
        <div className="mb-4">
          <h3 className="text-lg font-bold text-gray-900">{step.title}</h3>
          <p className="mt-2 text-sm leading-relaxed text-gray-600">{step.content}</p>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">
              {currentStep + 1} de {steps.length}
            </span>
            <div className="flex gap-1">
              {steps.map((_, idx) => (
                <div
                  key={idx}
                  className={`h-1.5 w-1.5 rounded-full transition-colors ${
                    idx === currentStep ? 'bg-brand-pink' : 'bg-gray-300'
                  }`}
                />
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {currentStep > 0 && (
              <button
                type="button"
                onClick={handlePrevious}
                className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-semibold text-gray-700 hover:bg-gray-50"
              >
                Atrás
              </button>
            )}
            <button
              type="button"
              onClick={handleSkip}
              className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-semibold text-gray-700 hover:bg-gray-50"
            >
              Saltar
            </button>
            <button
              type="button"
              onClick={handleNext}
              className="rounded-lg bg-brand-pink px-4 py-1.5 text-sm font-bold text-white shadow-lg hover:opacity-90"
            >
              {currentStep === steps.length - 1 ? 'Entendido' : 'Siguiente'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
