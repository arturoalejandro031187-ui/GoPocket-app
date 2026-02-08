'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Image from 'next/image';

export type MascotEmotion = 'happy' | 'sad' | 'thinking' | 'helpful' | 'waving';

interface PockyRobotProps {
    initialEmotion?: MascotEmotion;
    interactive?: boolean;
}

const PockyRobot: React.FC<PockyRobotProps> = ({
    initialEmotion = 'happy',
    interactive = true
}) => {
    const [emotion, setEmotion] = useState<MascotEmotion>(initialEmotion);
    const [isHovered, setIsHovered] = useState(false);
    const [message, setMessage] = useState<string | null>(null);

    // Mensajes predefinidos para cada emoción
    const emotionMessages: Record<MascotEmotion, string> = {
        happy: "¡Todo va de maravilla! 😄",
        sad: "Ups... algo no salió bien. 😔",
        thinking: "Déjame procesar eso... 🤖",
        helpful: "¿En qué puedo ayudarte hoy? 💡",
        waving: "¡Hola! Bienvenido a Pocket App 👋",
    };

    useEffect(() => {
        if (initialEmotion === 'happy') {
            setMessage("¡Hola! Soy Pocky, tu asistente personal. 😊");
            const timer = setTimeout(() => setMessage(null), 5000);
            return () => clearTimeout(timer);
        }
    }, []);

    const handleInteraction = () => {
        if (!interactive) return;

        // Cambiar a una emoción aleatoria o ciclo
        const emotions: MascotEmotion[] = ['happy', 'waving', 'thinking', 'helpful'];
        const nextRand = emotions[Math.floor(Math.random() * emotions.length)];
        setEmotion(nextRand);
        setMessage(emotionMessages[nextRand]);

        setTimeout(() => setMessage(null), 4000);
    };

    return (
        <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end pointer-events-none">
            <AnimatePresence>
                {message && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.8, y: 10 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.8, y: 10 }}
                        className="mb-4 max-w-[200px] rounded-2xl bg-white p-4 shadow-xl ring-1 ring-pink-100/50"
                    >
                        <p className="text-sm font-medium text-gray-800">{message}</p>
                        {/* Triángulo del globo de texto */}
                        <div className="absolute -bottom-2 right-6 h-4 w-4 rotate-45 bg-white shadow-xl" />
                    </motion.div>
                )}
            </AnimatePresence>

            <motion.div
                className="pointer-events-auto cursor-pointer"
                whileHover={{ scale: 1.1, rotate: 2 }}
                whileTap={{ scale: 0.9 }}
                onHoverStart={() => setIsHovered(true)}
                onHoverEnd={() => setIsHovered(false)}
                onClick={handleInteraction}
                animate={isHovered ? { y: [0, -5, 0] } : { y: [0, -8, 0] }}
                transition={{
                    y: {
                        duration: 2,
                        repeat: Infinity,
                        ease: "easeInOut"
                    }
                }}
            >
                <div className="relative h-24 w-24 overflow-hidden rounded-full bg-gradient-to-br from-pink-50 to-white p-2 shadow-2xl ring-4 ring-pink-100/30">
                    <Image
                        src="/pocket-robot.png"
                        alt="Pocky Robot"
                        fill
                        className="object-contain"
                        priority
                    />

                    {/* Overlay de brillo para que parezca más tecnológico */}
                    <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/20 to-transparent pointer-events-none" />
                </div>

                {/* Sombra proyectada */}
                <motion.div
                    className="mx-auto mt-2 h-2 w-16 rounded-full bg-black/10 blur-sm"
                    animate={{ scale: isHovered ? 1.2 : 1 }}
                />
            </motion.div>
        </div>
    );
};

export default PockyRobot;
