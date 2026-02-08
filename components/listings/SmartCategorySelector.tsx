'use client';

import { useState, useEffect, useRef } from 'react';
import { Check, ChevronsUpDown, Plus } from 'lucide-react';

interface SmartCategorySelectorProps {
  value: string;
  onChange: (value: string) => void;
  categories: string[];
  onPropose: (newValue: string) => void;
}

export function SmartCategorySelector({ value, onChange, categories, onPropose }: SmartCategorySelectorProps) {
  const [open, setOpen] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  // Sync input with external value only if it matches one of the known categories
  // OR if it's not empty (to preserve what user typed if they are editing)
  useEffect(() => {
    if (value) {
        setInputValue(value);
    }
  }, [value]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const normalizeText = (text: string) => {
    return text
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  };

  const filteredCategories = categories.filter((cat) => {
    const normCat = normalizeText(cat);
    const normInput = normalizeText(inputValue);
    return normCat.includes(normInput) || (normInput.length > 3 && normInput.includes(normCat));
  });

  const showCreateOption = inputValue.trim().length > 0 && 
    !categories.some(c => normalizeText(c) === normalizeText(inputValue.trim()));

  return (
    <div className="relative" ref={containerRef}>
      <div className="relative">
        <input
          type="text"
          className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm outline-none focus:border-transparent focus:ring-2 focus:ring-brand-pink pr-10"
          placeholder="Selecciona o escribe una categoría..."
          value={inputValue}
          onChange={(e) => {
             setInputValue(e.target.value);
             setOpen(true);
          }}
          onFocus={() => setOpen(true)}
        />
        <button
            type="button"
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            onClick={() => setOpen(!open)}
        >
            <ChevronsUpDown className="h-4 w-4" />
        </button>
      </div>

      {open && (
        <div className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-xl border border-gray-200 bg-white py-1 shadow-lg ring-1 ring-black ring-opacity-5">
            {filteredCategories.map((cat) => (
                <button
                    key={cat}
                    type="button"
                    className="flex w-full items-center justify-between px-4 py-2 text-left text-sm hover:bg-gray-50 text-gray-900"
                    onClick={() => {
                        onChange(cat);
                        setInputValue(cat);
                        setOpen(false);
                    }}
                >
                    {cat}
                    {value === cat && <Check className="h-4 w-4 text-brand-pink" />}
                </button>
            ))}
            
            {showCreateOption && (
                <button
                    type="button"
                    className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-brand-pink hover:bg-pink-50 font-medium border-t border-gray-100"
                    onClick={() => {
                        onPropose(inputValue.trim());
                        setOpen(false);
                    }}
                >
                    <Plus className="h-4 w-4" />
                    Crear "{inputValue.trim()}"
                </button>
            )}

            {filteredCategories.length === 0 && !showCreateOption && (
                <div className="px-4 py-2 text-sm text-gray-500">
                    No se encontraron resultados.
                </div>
            )}
        </div>
      )}
    </div>
  );
}
