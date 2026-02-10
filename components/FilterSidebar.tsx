'use client';

import { Category, NEW_CATEGORIES_CONFIG } from '@/lib/categories';

interface FilterSidebarProps {
  selectedGender: string;
  setSelectedGender: (v: string) => void;
  selectedCategory: string;
  setSelectedCategory: (v: string) => void;
  selectedSubcategory: string;
  setSelectedSubcategory: (v: string) => void;
  availableCategories: Category[];
  availableSubcategories: any[];
  onClear: () => void;
}

export function FilterSidebar({
  selectedGender,
  setSelectedGender,
  selectedCategory,
  setSelectedCategory,
  selectedSubcategory,
  setSelectedSubcategory,
  availableCategories,
  availableSubcategories,
  onClear,
}: FilterSidebarProps) {
  return (
    <div className="w-full space-y-6">
      {/* Gender Filter */}
      <div>
        <h3 className="mb-2 text-sm font-bold text-gray-900">Género / Sección</h3>
        <div className="space-y-2">
          {ROOT_CATEGORIES.map((g) => (
            <label key={g} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input
                type="radio"
                name="gender"
                value={g}
                checked={selectedGender === g}
                onChange={(e) => {
                  setSelectedGender(e.target.value);
                  setSelectedCategory('');
                  setSelectedSubcategory('');
                }}
                className="h-4 w-4 border-gray-300 text-brand-pink focus:ring-brand-pink"
              />
              {g}
            </label>
          ))}
        </div>
      </div>

      {/* Category Filter */}
      {availableCategories.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-bold text-gray-900">Categoría</h3>
          <select
            value={selectedCategory}
            onChange={(e) => {
              setSelectedCategory(e.target.value);
              setSelectedSubcategory('');
            }}
            className="w-full rounded-xl border-gray-300 text-sm focus:border-brand-pink focus:ring-brand-pink"
          >
            <option value="">Todas</option>
            {availableCategories.map((c) => (
              <option key={c.id} value={c.label}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Subcategory Filter */}
      {availableSubcategories.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-bold text-gray-900">Subcategoría</h3>
          <select
            value={selectedSubcategory}
            onChange={(e) => setSelectedSubcategory(e.target.value)}
            className="w-full rounded-xl border-gray-300 text-sm focus:border-brand-pink focus:ring-brand-pink"
          >
            <option value="">Todas</option>
            {availableSubcategories.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
      )}

      <button
        onClick={onClear}
        className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50"
      >
        Limpiar filtros
      </button>
    </div>
  );
}
