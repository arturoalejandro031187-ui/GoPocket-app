'use client';

import Link from 'next/link';
import { useState, useRef, useEffect } from 'react';

type GenderCategory = {
  label: 'Mujeres' | 'Hombre' | 'Niños' | 'Niñas';
  categories: string[];
};

const genderCategories: GenderCategory[] = [
  {
    label: 'Mujeres',
    categories: [
      'Blusas',
      'Playeras',
      'Tops y Bodies',
      'Sueter y Cardigans',
      'Sudaderas',
      'Pantalones',
      'Jeans',
      'Leggings',
      'Faldas',
      'Shorts y Bermudas',
      'Chamarras',
      'Abrigos y Gabardinas',
      'Chalecos',
      'Sacos y Blazers',
      'Vestidos',
      'Overoles y Jumpers',
      'Lenceria',
      'Pijamas',
      'Ropa de Playa',
      'Conjuntos Deportivos',
      'Ropa de Alto Rendimiento',
      'Tenis',
      'Sandalias y Chanclas',
      'Botas y Botines',
      'Zapatillas y Tacones',
      'Flats Mocasines',
      'Pantunflas',
      'Alpargatas',
      'Calzado Escolar',
      'Calzado Laboral',
    ],
  },
  {
    label: 'Hombre',
    categories: [
      'Playeras',
      'Camisas',
      'Sudaderas',
      'Sueteres',
      'Pantalones',
      'Jeans',
      'Shorts y Bermudas',
      'Chamarra',
      'Sacos y Blazers',
      'Abrigos y Gabardinas',
      'Trajes',
      'Ropa Interior',
      'Pijamas',
      'Ropa de Playa',
      'Ropa de Entrenamiento',
      'Jerseys',
      'Tenis',
      'Casual Skate',
      'Zapatos Oxfords',
      'Mocasines',
      'Botas y Botines',
      'Sandalias y Chanclas',
      'Alpargatas',
      'Pantunflas',
    ],
  },
  {
    label: 'Niñas',
    categories: [
      'Vestidos Casual',
      'Vestidos de Fiesta',
      'Playeras',
      'Blusas',
      'Playeras, Tops y Crop Tops',
      'Pantalones',
      'Leggings',
      'Jeans',
      'Joggers y Pants',
      'Faldas y Shorts',
      'Chamarras',
      'Sudaderas',
      'Abrigos y Capas',
      'Pijamas',
      'Trajes de Baño',
      'Tenis',
      'Zapatos',
      'Botas y Botines',
      'Sandalias y Chanclas',
      'Pantunflas',
    ],
  },
  {
    label: 'Niños',
    categories: [
      'Playeras',
      'Polos',
      'Tanks',
      'Pantalones',
      'Jeans',
      'Joggers y Pants',
      'Shorts y Bermudas',
      'Sudadera',
      'Chamarras',
      'Sueteres',
      'Conjuntos',
      'Pijamas',
      'Ropa Interior',
      'Ropa Deportiva',
      'Trajes',
      'Tenis',
      'Zapatos',
      'Botas y Botines',
      'Sandalias y Chanclas',
      'Pantunflas',
    ],
  },
];

export function CategoryDropdownMenu() {
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const menuRefs = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      for (const [key, ref] of Object.entries(menuRefs.current)) {
        if (ref && !ref.contains(event.target as Node)) {
          setOpenMenu(null);
        }
      }
    };

    if (openMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [openMenu]);

  return (
    <nav className="relative flex items-center gap-1">
      {genderCategories.map((gender) => (
        <div key={gender.label} className="relative" ref={(el) => { menuRefs.current[gender.label] = el; }}>
          <button
            type="button"
            onMouseEnter={() => setOpenMenu(gender.label)}
            onMouseLeave={() => setOpenMenu(null)}
            className="flex items-center gap-1 rounded-lg px-4 py-2 text-sm font-semibold text-gray-700 transition-all duration-300 hover:bg-gray-100 hover:scale-105 group"
          >
            {gender.label}
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={`transition-all duration-300 ${openMenu === gender.label ? 'rotate-180' : ''} group-hover:scale-110`}
            >
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>

          {/* Dropdown menu rosa transparente */}
          {openMenu === gender.label && (
            <div
              className="absolute left-0 top-full z-50 mt-1 min-w-[300px] max-w-md rounded-2xl bg-gradient-to-br from-pink-500/95 to-pink-600/95 backdrop-blur-md shadow-2xl ring-1 ring-pink-300/50 animate-slide-down"
              onMouseEnter={() => setOpenMenu(gender.label)}
              onMouseLeave={() => setOpenMenu(null)}
            >
              {/* Flecha apuntando hacia arriba */}
              <div className="absolute -top-2 left-6 h-4 w-4 rotate-45 bg-pink-500/95 ring-1 ring-pink-300/50" />
              <div className="relative p-4">
                <div className="mb-3 border-b border-white/20 pb-2">
                  <div className="text-sm font-extrabold uppercase tracking-wider text-white">{gender.label}</div>
                </div>
                <div className="max-h-[500px] overflow-y-auto scrollbar-subtle">
                  <div className="grid grid-cols-1 gap-0.5">
                    {gender.categories.map((category) => (
                      <Link
                        key={category}
                        href={`/listings?gender=${encodeURIComponent(gender.label === 'Mujeres' ? 'Mujer' : gender.label)}&category=${encodeURIComponent(category)}`}
                        className="rounded-lg px-3 py-2.5 text-sm font-medium text-white transition-all duration-300 hover:bg-white/25 hover:shadow-sm hover:scale-[1.02] hover:translate-x-1"
                        onClick={() => setOpenMenu(null)}
                      >
                        {category}
                      </Link>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      ))}
    </nav>
  );
}
