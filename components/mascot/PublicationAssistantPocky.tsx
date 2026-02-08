'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { PocketMascot, MascotEmotion } from './PocketMascot';

interface PublicationAssistantPockyProps {
    error: string | null;
    isSaving?: boolean;
}

export function PublicationAssistantPocky({ error, isSaving }: PublicationAssistantPockyProps) {
    const [isVisible, setIsVisible] = useState(false);
    const [currentMessage, setCurrentMessage] = useState<string | null>(null);
    const [emotion, setEmotion] = useState<MascotEmotion>('waiting');
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    // Effect for error/saving state
    useEffect(() => {
        let timer: NodeJS.Timeout;

        if (error) {
            setEmotion('confused');
            setCurrentMessage(error);
            setIsVisible(true);
        } else if (isSaving) {
            setEmotion('thinking');
            setCurrentMessage('Procesando tu publicación... ¡Ya casi está! 🚀');
            setIsVisible(true);
        } else {
            // Delay hiding if returning to normal
            timer = setTimeout(() => {
                setIsVisible(false);
                setEmotion('waiting');
            }, 5000);
        }

        return () => {
            if (timer) clearTimeout(timer);
        };
    }, [error, isSaving]);

    // Mostrar un tip aleatorio cada 30 segundos si no hay errores ni se está guardando
    useEffect(() => {
        if (!mounted) return;

        let interval: NodeJS.Timeout;
        let hideTimer: NodeJS.Timeout;

        if (!error && !isSaving) {
            const tips = [
                "¡Hola! Soy Pocky. Estoy aquí para ayudarte a publicar tu producto.",
                "Recuerda que buenas fotos atraen más compradores. 📸",
                "Un título descriptivo ayuda a que te encuentren más rápido.",
                "Si tienes dudas, ¡haz clic en mí!",
            ];

            interval = setInterval(() => {
                if (!isVisible) {
                    const randTip = tips[Math.floor(Math.random() * tips.length)];
                    setCurrentMessage(randTip);
                    setEmotion('happy');
                    setIsVisible(true);

                    hideTimer = setTimeout(() => {
                        setIsVisible(prev => {
                            // Only hide if we are still showing a tip (no error appeared meanwhile)
                            return false;
                        });
                    }, 6000);
                }
            }, 30000);
        }

        return () => {
            if (interval) clearInterval(interval);
            if (hideTimer) clearTimeout(hideTimer);
        };
    }, [error, isSaving, isVisible]);

    const handleInteraction = () => {
        const funMessages = [
            "¡Eso! Vamos a vender mucho hoy. 🚀",
            "¡Me encanta ayudarte! Eres un gran vendedor. ✨",
            "¡Click! Jeje, eso me dio cosquillas. 🤖",
            "¿Sabías que los productos con buenas descripciones venden 30% más? 💡",
            "¡Pocky al rescate! ¿Qué más vamos a publicar? 🎒",
            "¡Bip-bup! Todo va sobre ruedas. ⚙️"
        ];
        const randMessage = funMessages[Math.floor(Math.random() * funMessages.length)];
        setEmotion('excited');
        setCurrentMessage(randMessage);
        setIsVisible(true);

        setTimeout(() => {
            // Only hide if no error is active
            if (!error) setIsVisible(false);
        }, 5000);
    };

    if (!mounted) return null;

    return (
        <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end pointer-events-none">
            <AnimatePresence>
                {isVisible && currentMessage && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.8, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.8, y: 20 }}
                        className="mb-4 max-w-[240px] pointer-events-auto"
                    >
                        <div className="relative rounded-2xl bg-gray-900 px-4 py-3 shadow-2xl ring-1 ring-white/10">
                            <p className="text-xs font-bold leading-relaxed text-white">
                                {currentMessage}
                            </p>
                            <div className="absolute -bottom-1.5 right-8 h-3 w-3 rotate-45 bg-gray-900" />
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            <div className="pointer-events-auto">
                <motion.div
                    whileHover={{ scale: 1.1 }}
                    onClick={handleInteraction}
                >
                    <PocketMascot emotion={emotion} size={100} lookingAt="left" />
                </motion.div>
            </div>
        </div>
    );
}
