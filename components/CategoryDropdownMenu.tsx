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
      'Tops',
      'Blusas',
      'Camisetas y Tops',
      'Bodies',
      'Croptops',
      'Vestidos Cortos',
      'Vestidos Largos y Midi',
      'Enterizos (Jumpsuits)',
      'Jeans',
      'Pantalones',
      'Faldas',
      'Shorts',
      'Leggings',
      'Chaquetas y Chamarras',
      'Abrigos y Blazers',
      'Sudaderas y Cardigans',
      'Lencería y Pijamas',
      'Ropa de Baño',
      'Ropa Deportiva',
      'Bolsas',
      'Zapatos',
      'Accesorios',
      'Top marcas',
      'Otro',
    ],
  },
  {
    label: 'Hombre',
    categories: [
      'Camisetas',
      'Polos',
      'Camisas Casuales',
      'Camisas de Vestir',
      'Jeans',
      'Pantalones Chinos',
      'Pantalones de Vestir',
      'Bermudas y Shorts',
      'Trajes Completos',
      'Blazers y Sacos',
      'Chalecos',
      'Chamarras',
      'Sudaderas (Hoodies)',
      'Suéteres',
      'Ropa Interior y Pijamas',
      'Ropa de Baño',
      'Ropa Deportiva',
      'Tenis y Sneakers',
      'Botas y Botines',
      'Zapatos Formales',
      'Sandalias',
      'Tacones (Dama)',
      'Cinturones',
      'Gafas de Sol',
      'Relojes y Joyería',
      'Gorras y Sombreros',
      'Bolsos de Mano',
      'Mochilas',
      'Maletines y Carteras',
      'Top marcas',
      'Otro',
    ],
  },
  {
    label: 'Niñas',
    categories: [
      'Tops',
      'Camisetas y Tops',
      'Blusas',
      'Sudaderas',
      'Suéteres y Cardigans',
      'Vestidos y Conjuntos',
      'Vestidos Casuales',
      'Vestidos de Fiesta',
      'Monos y Jumpers',
      'Conjuntos de 2 Piezas',
      'Partes Bajas',
      'Leggings',
      'Pantalones y Jeans',
      'Faldas y Tutús',
      'Shorts',
      'Ropa de Abrigo',
      'Chamarras y Abrigos',
      'Chalecos',
      'Ropa Interior y Dormir',
      'Pijamas',
      'Ropa Interior y Calcetas',
      'Ropa de Baño',
      'Ropa Deportiva',
    ],
  },
  {
    label: 'Niños',
    categories: [
      'Camisetas',
      'Polos',
      'Camisas',
      'Sudaderas (Hoodies)',
      'Suéteres',
      'Partes Bajas',
      'Jeans',
      'Pantalones (Chinos/Cargo)',
      'Bermudas y Shorts',
      'Joggers',
      'Ropa de Abrigo',
      'Chamarras y Rompevientos',
      'Abrigos y Blazers',
      'Chalecos',
      'Ropa Interior y Dormir',
      'Pijamas',
      'Boxers y Calcetas',
      'Ropa de Baño',
      'Ropa Deportiva',
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
            className="flex items-center gap-1 rounded-lg px-4 py-2 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-100"
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
              className={`transition-transform ${openMenu === gender.label ? 'rotate-180' : ''}`}
            >
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>

          {/* Dropdown menu rosa transparente */}
          {openMenu === gender.label && (
            <div
              className="absolute left-0 top-full z-50 mt-1 min-w-[300px] max-w-md rounded-2xl bg-gradient-to-br from-pink-500/95 to-pink-600/95 backdrop-blur-md shadow-2xl ring-1 ring-pink-300/50"
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
                        className="rounded-lg px-3 py-2.5 text-sm font-medium text-white transition-colors hover:bg-white/25 hover:shadow-sm"
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
