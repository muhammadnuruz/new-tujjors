import { Menu, Search, X } from 'lucide-react'
import { forwardRef, useEffect, useMemo, useRef, useState } from 'react'
import {
  ALL_CATEGORIES,
  buildCategoryList,
  getCategoryKey,
} from '../lib/categoryTree'
import { formatCount } from '../lib/format'

export { ALL_CATEGORIES }

const CategoryCount = ({ count, active }) => (
  <span
    className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${
      active
        ? 'bg-white/20 text-app-accent-contrast'
        : 'bg-emerald-100 text-emerald-800'
    }`}
  >
    {formatCount(count)}
  </span>
)

const StoreHeader = forwardRef(({
  categories = [],
  subCategories = [],
  products = [],
  search,
  onSearchChange,
  selectedCategory,
  onSelectAllCategories,
  onSelectCategory,
}, headerRef) => {
  const [categoryMenuOpen, setCategoryMenuOpen] = useState(false)
  const categoryTriggerRef = useRef(null)
  const categoryDrawerRef = useRef(null)
  const categoryList = useMemo(
    () => buildCategoryList(categories, products),
    [categories, products],
  )
  const totalCategoryCount = categoryList.reduce((sum, category) => sum + (category.count || 0), 0)

  useEffect(() => {
    if (!categoryMenuOpen || !import.meta.env.DEV) {
      return
    }
    console.info('[StoreHeader] category section data', {
      rawCategories: categories,
      rawSubCategories: subCategories,
      productsCount: products.length,
      visibleCategories: categoryList,
    })
  }, [categories, categoryList, categoryMenuOpen, products, subCategories])

  useEffect(() => {
    if (!categoryMenuOpen) {
      return undefined
    }

    const handlePointerDown = (event) => {
      const clickedTrigger = categoryTriggerRef.current?.contains(event.target)
      const clickedDrawer = categoryDrawerRef.current?.contains(event.target)
      if (!clickedTrigger && !clickedDrawer) {
        setCategoryMenuOpen(false)
      }
    }

    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        setCategoryMenuOpen(false)
      }
    }

    window.addEventListener('mousedown', handlePointerDown)
    window.addEventListener('keydown', handleEscape)

    return () => {
      window.removeEventListener('mousedown', handlePointerDown)
      window.removeEventListener('keydown', handleEscape)
    }
  }, [categoryMenuOpen])

  const closeCategoryMenu = () => setCategoryMenuOpen(false)
  const toggleCategoryMenu = () => {
    setCategoryMenuOpen((current) => !current)
  }

  const selectAllCategories = () => {
    onSelectAllCategories()
    closeCategoryMenu()
  }

  const selectCategory = (category) => {
    onSelectCategory(category)
    closeCategoryMenu()
  }

  return (
    <>
      <header
        ref={headerRef}
        className="fixed top-0 right-0 left-0 z-20 shrink-0 border-b border-app-border bg-app-surface"
      >
        <div className="mx-auto flex w-full max-w-7xl items-center gap-3 px-4 py-4">
          <div ref={categoryTriggerRef} className="shrink-0">
            <button
              type="button"
              onClick={toggleCategoryMenu}
              aria-label="Open categories"
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-app-surface text-app-text"
            >
              <Menu size={18} />
            </button>
          </div>

          <label className="relative min-w-0 flex-1">
            <span className="sr-only">Qidirish</span>
            <Search
              size={18}
              className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-app-text-soft"
            />
            <input
              type="search"
              value={search}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder="Nomi yoki bar kod"
              className="w-full rounded-2xl border border-app-border bg-app-surface-muted py-3 pr-4 pl-11 text-sm text-app-text"
            />
          </label>
        </div>
      </header>

      {categoryMenuOpen && (
        <div className="fixed inset-0 z-50 bg-black/35">
          <div className="flex h-full">
            <aside
              ref={categoryDrawerRef}
              className="flex h-full w-full max-w-sm flex-col border-r border-app-border bg-app-surface shadow-soft"
            >
              <div className="flex items-start justify-between gap-3 border-b border-app-border px-5 py-4">
                <div>
                  <p className="text-sm font-extrabold text-app-text">Kategoriyalar</p>
                  <p className="mt-1 text-xs text-app-text-soft">Katalog bo&apos;limlari</p>
                </div>
                <button
                  type="button"
                  onClick={closeCategoryMenu}
                  className="rounded-full border border-app-border p-2 text-app-text-soft"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto p-4">
                <button
                  type="button"
                  onClick={selectAllCategories}
                  className={`w-full rounded-2xl border px-4 py-3 text-left transition ${
                    selectedCategory === ALL_CATEGORIES
                      ? 'border-app-accent bg-app-accent text-app-accent-contrast shadow-soft'
                      : 'border-app-border bg-app-surface-muted text-app-text'
                  }`}
                >
                  <span className="flex items-center justify-between gap-3">
                    <span>
                      <span className="block text-sm font-bold">Barchasi</span>
                      <span
                        className={`mt-1 block text-xs ${
                          selectedCategory === ALL_CATEGORIES
                            ? 'text-app-accent-contrast/80'
                            : 'text-app-text-soft'
                        }`}
                      >
                        Barcha kategoriyalar
                      </span>
                    </span>
                    <CategoryCount
                      count={totalCategoryCount}
                      active={selectedCategory === ALL_CATEGORIES}
                    />
                  </span>
                </button>

                <div className="mt-3 space-y-2">
                  {categoryList.map((category) => {
                    const categoryKey = getCategoryKey(category)
                    const isActive = selectedCategory === category.name

                    return (
                      <button
                        key={categoryKey}
                        type="button"
                        onClick={() => selectCategory(category.name)}
                        className={`flex w-full items-center gap-3 rounded-2xl border border-app-border p-4 text-left transition ${
                          isActive
                            ? 'bg-app-accent text-app-accent-contrast shadow-soft'
                            : 'bg-app-surface-muted text-app-text hover:bg-app-surface'
                        }`}
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-bold">
                            {category.name}
                          </span>
                          <span
                            className={`mt-1 block text-xs ${
                              isActive
                                ? 'text-app-accent-contrast/80'
                                : 'text-app-text-soft'
                            }`}
                          >
                            Mahsulot kategoriyasi
                          </span>
                        </span>
                        <CategoryCount count={category.count} active={isActive} />
                      </button>
                    )
                  })}
                </div>
              </div>
            </aside>

            <button
              type="button"
              onClick={closeCategoryMenu}
              className="hidden flex-1 md:block"
              aria-label="Close categories"
            />
          </div>
        </div>
      )}
    </>
  )
})

StoreHeader.displayName = 'StoreHeader'

export default StoreHeader
