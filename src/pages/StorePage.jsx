import {
  startTransition,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { ChevronDown, ChevronUp, Crown, ShoppingCart } from 'lucide-react'
import CartDrawer from '../components/CartDrawer'
import ProductCard, { ProductCardSkeleton } from '../components/ProductCard'
import StoreHeader, {
  ALL_CATEGORIES,
} from '../components/StoreHeader.jsx'
import { formatCount, formatPrice } from '../lib/format'
import { submitDealerOrder } from '../lib/orders'
import { loadSalesDocProducts } from '../lib/salesDoc'
import { staticCategories, staticProducts } from '../lib/staticStore'

const LOADING_SKELETON_COUNT = 6
const INITIAL_VISIBLE_PRODUCTS = 12
const VISIBLE_PRODUCTS_STEP = 9
const EMPTY_FORM = {
  customerName: '',
  customerPhone: '',
}

const ToneClasses = {
  info: 'border-app-border bg-app-surface text-app-text',
  success: 'border-app-accent bg-app-accent-soft text-app-text',
  error: 'border-app-danger bg-app-danger-soft text-app-danger',
}

const clampQuantity = (value) => {
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed) || parsed < 1) {
    return 1
  }
  return parsed
}

const compactCustomerText = (value) =>
  typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : ''

const normalizeCustomerName = (value) => compactCustomerText(value)

const normalizeCustomerPhone = (value) => {
  const raw = typeof value === 'string' ? value.trim() : ''
  const digits = raw.replace(/\D/g, '')
  if (digits.length === 9) {
    return `+998${digits}`
  }
  if (digits.length === 12 && digits.startsWith('998')) {
    return `+${digits}`
  }
  if (raw.startsWith('+') && digits) {
    return `+${digits}`
  }
  return raw
}

const computeCartStatsForBrand = (brand, cartItems) => {
  if (!brand) return { amount: 0, points: 0 }
  const amount = cartItems.reduce((sum, item) => {
    const itemCategoryId = item.categoryId || item.raw?.category?.CS_id
    if (itemCategoryId !== brand.category_id) return sum
    return sum + (Number(item.price) || 0) * (Number(item.quantity) || 0)
  }, 0)
  let points = 0
  for (const tier of brand.tiers) {
    if (amount >= tier.amount) points = tier.points
  }
  return { amount, points }
}

const countLetters = (value) => value.replace(/[^\p{L}]/gu, '').length

const validateCustomerForm = (form) => {
  const customerName = normalizeCustomerName(form.customerName)
  const customerPhone = normalizeCustomerPhone(form.customerPhone)
  const errors = {}
  if (!customerName) {
    errors.customerName = 'Ism kiritilishi shart.'
  } else if (countLetters(customerName) < 2) {
    errors.customerName = "Ism kamida 2 ta harfdan iborat bo'lsin."
  } else if (/\d/.test(customerName)) {
    errors.customerName = "Ism ichida raqam bo'lmasin."
  }
  if (!customerPhone) {
    errors.customerPhone = 'Telefon raqami kiritilishi shart.'
  } else if (!/^\+998\d{9}$/.test(customerPhone)) {
    errors.customerPhone = "Telefon +998901234567 formatida bo'lsin."
  }
  return errors
}

const normalizeCustomerForm = (form) => ({
  customerName: normalizeCustomerName(form.customerName),
  customerPhone: normalizeCustomerPhone(form.customerPhone),
})

const BonusTierContent = ({ tier }) => (
  <>
    <span className="text-xs leading-tight font-extrabold whitespace-nowrap text-app-text sm:text-sm">
      {formatCount(tier.points)} ball
    </span>
    <span className="text-[10px] leading-tight whitespace-nowrap text-app-text-soft sm:text-xs">
      {formatPrice(tier.amount)}
    </span>
  </>
)

const BonusTierChip = ({ tier, index }) => (
  <div
    key={`tier-${index}`}
    className="flex shrink-0 flex-col items-center rounded-lg bg-app-surface px-1.5 py-1 text-center sm:px-2"
  >
    <BonusTierContent tier={tier} />
  </div>
)

// Pinned per-category bonus banner. Below `sm` it renders as a single
// tappable compact bar (icon + truncated name + earned points) that expands
// in place to reveal the status line and tier chips; `sm:` and up it always
// shows the full layout and the toggle is irrelevant. Both the mobile and
// desktop branches live in this one component so the fixed banner and its
// ghost spacer (see "Ghost clone" below) never drift apart in height.
const BonusBrandRow = ({ brand, statusNode, mobileAmountNode, points, mobileExpanded, onToggleMobileExpanded }) => (
  <div>
    <button
      type="button"
      onClick={onToggleMobileExpanded}
      aria-expanded={mobileExpanded}
      className="flex w-full min-w-0 flex-nowrap items-center gap-2 text-left sm:hidden"
    >
      <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-app-accent text-app-accent-contrast">
        <Crown size={14} strokeWidth={2.1} />
      </span>
      <p className="min-w-0 flex-1 truncate text-xs leading-tight font-extrabold text-app-text uppercase">
        {brand.category_name}
      </p>
      <span className="shrink-0 text-xs leading-tight font-extrabold whitespace-nowrap text-app-text">
        {formatCount(points)} ball
      </span>
      {mobileExpanded ? (
        <ChevronUp size={18} className="shrink-0 text-app-text-soft" />
      ) : (
        <ChevronDown size={18} className="shrink-0 text-app-text-soft" />
      )}
    </button>

    {mobileExpanded && (
      <div className="mt-2 flex flex-col gap-1.5 sm:hidden">
        {mobileAmountNode}
        <div className="flex flex-wrap items-center gap-1.5">
          {brand.tiers.map((tier, index) => (
            <BonusTierChip key={`${brand.category_id}-tier-mobile-${index}`} tier={tier} index={index} />
          ))}
        </div>
      </div>
    )}

    <div className="hidden items-center gap-3 sm:flex sm:flex-wrap">
      <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-app-accent text-app-accent-contrast">
        <Crown size={18} strokeWidth={2.1} />
      </span>
      <div className="mr-1 min-w-0 flex-1">
        <p className="truncate text-sm leading-tight font-extrabold text-app-text uppercase">
          {brand.category_name}
        </p>
        {statusNode}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {brand.tiers.map((tier, index) => (
          <BonusTierChip key={`${brand.category_id}-tier-${index}`} tier={tier} index={index} />
        ))}
      </div>
    </div>
  </div>
)

// Shared grid template for the overview list so every brand row's icon, name,
// and 5 tier columns line up across rows regardless of how long each brand's
// numbers are (fixed tracks, not content-driven auto sizing like BonusBrandRow).
const BONUS_OVERVIEW_GRID_COLS =
  'grid-cols-[2.25rem_minmax(10rem,1fr)_repeat(5,minmax(5.5rem,1fr))]'

const BonusBrandOverviewRow = ({ brand }) => (
  <div className={`grid ${BONUS_OVERVIEW_GRID_COLS} min-w-[42rem] items-center gap-x-3 gap-y-2`}>
    <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-app-accent text-app-accent-contrast">
      <Crown size={18} strokeWidth={2.1} />
    </span>
    <p className="min-w-0 truncate text-sm leading-tight font-extrabold text-app-text uppercase">
      {brand.category_name}
    </p>
    {brand.tiers.map((tier, index) => (
      <div
        key={`${brand.category_id}-tier-${index}`}
        className="flex flex-col items-center rounded-lg bg-app-surface px-1.5 py-1 text-center sm:px-2"
      >
        <BonusTierContent tier={tier} />
      </div>
    ))}
  </div>
)

const EmptyGrid = ({ searchTerm }) => (
  <div className="card-radius flex h-full min-h-0 flex-col items-center justify-center border border-dashed border-app-border bg-app-surface p-8 text-center">
    <h2 className="text-2xl font-extrabold text-app-text">Mahsulot topilmadi</h2>
    <p className="mt-3 max-w-md text-sm leading-6 text-app-text-soft">
      {searchTerm
        ? `"${searchTerm}" bo'yicha natija chiqmagan.`
        : "Hozircha ko'rsatish uchun mahsulot yo'q."}
    </p>
  </div>
)

const LoadingGrid = () => (
  <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
    {Array.from({ length: LOADING_SKELETON_COUNT }).map((_, index) => (
      <ProductCardSkeleton key={`loading-card-${index}`} />
    ))}
  </div>
)

const resolveDealerAccess = () => {
  if (typeof window === 'undefined') {
    return { hasAccess: false, dealerId: '' }
  }
  const pathSegments = window.location.pathname
    .split('/')
    .map((segment) => segment.trim())
    .filter(Boolean)
  const dealerId = pathSegments[0] || ''
  return { hasAccess: Boolean(dealerId), dealerId }
}

const StorePage = () => {
  const fallbackCategories = useMemo(() => staticCategories, [])
  const dealerAccess = useMemo(() => resolveDealerAccess(), [])
  const [products, setProducts] = useState([])
  const [categories, setCategories] = useState([])
  const [isProductsLoading, setIsProductsLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selectedCategory, setSelectedCategory] = useState(ALL_CATEGORIES)
  const [cart, setCart] = useState([])
  const [cartOpen, setCartOpen] = useState(false)
  const [visibleProductCount, setVisibleProductCount] = useState(INITIAL_VISIBLE_PRODUCTS)
  const [quantityEditor, setQuantityEditor] = useState({
    productId: null,
    quantity: '1',
  })
  const [customerForm, setCustomerForm] = useState(EMPTY_FORM)
  const [touchedFields, setTouchedFields] = useState({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [status, setStatus] = useState(null)
  const [bonus, setBonus] = useState(null)
  const [scrollActiveCategoryId, setScrollActiveCategoryId] = useState(null)
  const [mobileBonusExpanded, setMobileBonusExpanded] = useState(false)
  const [headerHeight, setHeaderHeight] = useState(96)
  const loadMoreTriggerRef = useRef(null)
  const categoryHeaderRefsRef = useRef(new Map())
  const headerRef = useRef(null)

  useEffect(() => {
    const element = headerRef.current
    if (!element) return undefined

    const measure = () => setHeaderHeight(element.offsetHeight)
    measure()

    const observer = new ResizeObserver(measure)
    observer.observe(element)

    return () => { observer.disconnect() }
  }, [])

  const deferredSearch = useDeferredValue(search.trim().toLowerCase())
  const customerFormErrors = useMemo(() => validateCustomerForm(customerForm), [customerForm])
  const visibleCustomerFormErrors = useMemo(
    () => ({
      customerName: touchedFields.customerName ? customerFormErrors.customerName : '',
      customerPhone: touchedFields.customerPhone ? customerFormErrors.customerPhone : '',
    }),
    [customerFormErrors, touchedFields],
  )

  useEffect(() => {
    let cancelled = false

    const fetchProducts = async () => {
      if (!dealerAccess.hasAccess) {
        setProducts([])
        setCategories([])
        setStatus({ tone: 'error', text: 'No dealer found' })
        setIsProductsLoading(false)
        return
      }

      try {
        setIsProductsLoading(true)
        setStatus({ tone: 'info', text: 'Mahsulotlar yuklanmoqda...' })

        const salesDocData = await loadSalesDocProducts(dealerAccess.dealerId)
        if (cancelled) return

        setProducts(salesDocData.products)
        setCategories(salesDocData.categories)
        setBonus(salesDocData.bonus || null)
        setStatus(null)
      } catch (error) {
        if (cancelled) return

        setProducts(staticProducts)
        setCategories(fallbackCategories)
        setBonus(null)
        setStatus({
          tone: 'error',
          text:
            error instanceof Error
              ? `${error.message} Statik mahsulotlar ko'rsatildi.`
              : "Katalog ulanmagan. Statik mahsulotlar ko'rsatildi.",
        })
      } finally {
        if (!cancelled) {
          setIsProductsLoading(false)
        }
      }
    }

    fetchProducts()

    return () => { cancelled = true }
  }, [dealerAccess.dealerId, dealerAccess.hasAccess, fallbackCategories])

  const selectedFilterLabel =
    selectedCategory === ALL_CATEGORIES ? "Barcha bo'limlar" : selectedCategory

  const selectedCategoryId = useMemo(() => {
    if (selectedCategory === ALL_CATEGORIES) return null
    return categories.find((category) => category.name === selectedCategory)?.id || null
  }, [selectedCategory, categories])

  const activeBonusBrand = useMemo(() => {
    if (!bonus?.enabled || !bonus?.show_in_catalog || !selectedCategoryId) return null
    return bonus.brands?.find((brand) => brand.category_id === selectedCategoryId) || null
  }, [bonus, selectedCategoryId])

  const scrollActiveBonusBrand = useMemo(() => {
    if (!bonus?.enabled || !bonus?.show_in_catalog || !scrollActiveCategoryId) return null
    return bonus.brands?.find((brand) => brand.category_id === scrollActiveCategoryId) || null
  }, [bonus, scrollActiveCategoryId])

  const effectiveBonusBrand =
    selectedCategory === ALL_CATEGORIES ? scrollActiveBonusBrand : activeBonusBrand

  const { amount: cartAmountForEffectiveBrand, points: cartPointsForEffectiveBrand } = useMemo(
    () => computeCartStatsForBrand(effectiveBonusBrand, cart),
    [effectiveBonusBrand, cart],
  )

  const filteredProducts = useMemo(() => {
    const nextProducts = products.filter((product) => {
      if (selectedCategory !== ALL_CATEGORIES && product.category !== selectedCategory) {
        return false
      }
      if (!deferredSearch) {
        return true
      }
      const haystack = `${product.name} ${product.code} ${product.barcode || ''}`.toLowerCase()
      return haystack.includes(deferredSearch)
    })

    return nextProducts.sort((leftProduct, rightProduct) => {
      const leftSortId =
        Number.isFinite(leftProduct.sortId) ? leftProduct.sortId : Number.MAX_SAFE_INTEGER
      const rightSortId =
        Number.isFinite(rightProduct.sortId) ? rightProduct.sortId : Number.MAX_SAFE_INTEGER

      if (leftSortId !== rightSortId) {
        return leftSortId - rightSortId
      }
      return String(leftProduct.name || leftProduct.id).localeCompare(
        String(rightProduct.name || rightProduct.id),
      )
    })
  }, [deferredSearch, products, selectedCategory])

  const visibleProducts = filteredProducts.slice(0, visibleProductCount)
  const hasMoreProducts = visibleProducts.length < filteredProducts.length

  const sectionedVisibleItems = useMemo(() => {
    if (selectedCategory !== ALL_CATEGORIES) {
      return visibleProducts.map((product) => ({ type: 'product', product }))
    }
    const items = []
    let previousCategory = null
    for (const product of visibleProducts) {
      if (product.category !== previousCategory) {
        items.push({
          type: 'header',
          categoryId: product.categoryId,
          categoryName: product.category,
        })
        previousCategory = product.category
      }
      items.push({ type: 'product', product })
    }
    return items
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCategory, visibleProductCount, filteredProducts])

  const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0)
  const cartQuantityById = useMemo(
    () => new Map(cart.map((item) => [item.id, item.quantity])),
    [cart],
  )

  useEffect(() => {
    setVisibleProductCount(INITIAL_VISIBLE_PRODUCTS)
    setScrollActiveCategoryId(null)
    setMobileBonusExpanded(false)
  }, [deferredSearch, selectedCategory, products])

  useEffect(() => {
    const trigger = loadMoreTriggerRef.current
    if (!trigger || isProductsLoading || !hasMoreProducts) {
      return undefined
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries
        if (!entry?.isIntersecting) return
        startTransition(() => {
          setVisibleProductCount((currentCount) =>
            Math.min(filteredProducts.length, currentCount + VISIBLE_PRODUCTS_STEP),
          )
        })
      },
      { rootMargin: '900px 0px' },
    )

    observer.observe(trigger)

    return () => { observer.disconnect() }
  }, [filteredProducts.length, hasMoreProducts, isProductsLoading])

  // Scroll-position based scroll-spy: instead of relying on IntersectionObserver
  // threshold crossings (which can miss headers entirely during fast/large
  // scroll jumps, leaving the active category stuck), we measure directly on
  // every scroll frame which header we've most recently scrolled past.
  useEffect(() => {
    if (selectedCategory !== ALL_CATEGORIES) {
      return undefined
    }

    // Trigger line sits just below the fixed StoreHeader (measured) plus the
    // compact bonus banner row (~56px), so a header counts as "current" right
    // as it slides under both fixed bars.
    const TRIGGER_LINE_PX = headerHeight + 56
    let ticking = false

    const computeActiveCategory = () => {
      ticking = false
      const headerEntries = Array.from(categoryHeaderRefsRef.current.entries())
      if (headerEntries.length === 0) return

      let candidate = null
      for (const [categoryId, element] of headerEntries) {
        const top = element.getBoundingClientRect().top
        if (top <= TRIGGER_LINE_PX) {
          if (!candidate || top > candidate.top) {
            candidate = { categoryId, top }
          }
        }
      }

      setScrollActiveCategoryId((current) => {
        if (candidate) return candidate.categoryId
        // Not scrolled to the first section yet — keep hidden rather than guessing.
        return current
      })
    }

    const onScroll = () => {
      if (ticking) return
      ticking = true
      window.requestAnimationFrame(computeActiveCategory)
    }

    computeActiveCategory() // run once immediately for the initial scroll position
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)

    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [selectedCategory, sectionedVisibleItems, headerHeight])

  const setCategoryHeaderRef = useCallback((categoryId) => (element) => {
    if (!categoryId) return
    if (element) {
      categoryHeaderRefsRef.current.set(categoryId, element)
    } else {
      categoryHeaderRefsRef.current.delete(categoryId)
    }
  }, [])

  const selectAllCategories = () => {
    setSelectedCategory(ALL_CATEGORIES)
  }

  const selectCategory = (category) => {
    setSelectedCategory(category)
  }

  const openQuantityEditor = (product) => {
    const existingItem = cart.find((item) => item.id === product.id)
    setQuantityEditor({
      productId: product.id,
      quantity: String(existingItem?.quantity || 1),
    })
  }

  const closeQuantityEditor = () =>
    setQuantityEditor({ productId: null, quantity: '1' })

  const updateCartItem = (product, nextQuantity, options = {}) => {
    const { announce = false } = options
    const quantity = clampQuantity(nextQuantity)
    setCart((currentCart) => {
      const nextItem = { ...product, quantity }
      const existingIndex = currentCart.findIndex((item) => item.id === product.id)
      if (existingIndex === -1) {
        return [...currentCart, nextItem]
      }
      const copy = [...currentCart]
      copy[existingIndex] = nextItem
      return copy
    })
    if (announce) {
      setStatus({
        tone: 'success',
        text: `${product.name} savatga ${quantity} ta qilib saqlandi.`,
      })
    }
  }

  const changeEditorQuantity = (value) => {
    setQuantityEditor((currentEditor) => ({ ...currentEditor, quantity: value }))
  }

  const adjustEditorQuantity = (step) => {
    setQuantityEditor((currentEditor) => ({
      ...currentEditor,
      quantity: String(Math.max(1, clampQuantity(currentEditor.quantity) + step)),
    }))
  }

  const saveEditorQuantity = (product) => {
    updateCartItem(product, quantityEditor.quantity, { announce: true })
    closeQuantityEditor()
  }

  const removeFromCart = (productId) => {
    setCart((currentCart) => currentCart.filter((item) => item.id !== productId))
    setQuantityEditor((currentEditor) =>
      currentEditor.productId === productId
        ? { productId: null, quantity: '1' }
        : currentEditor,
    )
  }

  const adjustCartItemQuantity = (product, step) => {
    const currentQuantity = cart.find((item) => item.id === product.id)?.quantity || 1
    updateCartItem(product, Math.max(1, currentQuantity + step))
  }

  const updateCartItemQuantity = (product, nextQuantity) => {
    updateCartItem(product, nextQuantity)
  }

  const handleCustomerFieldChange = (field, value) => {
    const nextValue =
      field === 'customerPhone' ? value.replace(/[^\d+\s()-]/g, '') : value
    setCustomerForm((currentForm) => ({ ...currentForm, [field]: nextValue }))
  }

  const handleCustomerFieldBlur = (field) => {
    setTouchedFields((currentTouchedFields) => ({ ...currentTouchedFields, [field]: true }))
  }

  const handleSubmit = async () => {
    const normalizedCustomerForm = normalizeCustomerForm(customerForm)
    const nextErrors = validateCustomerForm(normalizedCustomerForm)
    setTouchedFields({ customerName: true, customerPhone: true })

    if (Object.keys(nextErrors).length > 0) {
      setCustomerForm(normalizedCustomerForm)
      setStatus({
        tone: 'error',
        text: "Buyurtmani yuborish uchun ism va telefonni to'g'ri kiriting.",
      })
      return
    }

    try {
      setIsSubmitting(true)
      const payload = {
        dealerId: dealerAccess.dealerId,
        customer: normalizedCustomerForm,
        cart,
        createdAt: new Date().toISOString(),
        link: dealerAccess.dealerId,
      }
      const response = await submitDealerOrder(payload)
      window.localStorage.setItem('new-tujjors-last-order', JSON.stringify(payload))
      setCart([])
      setCartOpen(false)
      closeQuantityEditor()
      setCustomerForm(EMPTY_FORM)
      setTouchedFields({})
      setStatus({
        tone: 'success',
        text: response?.result?.message || "Buyurtma dealer serverga yuborildi.",
      })
    } catch (error) {
      const payload = {
        dealerId: dealerAccess.dealerId,
        customer: normalizedCustomerForm,
        cart,
        createdAt: new Date().toISOString(),
        link: dealerAccess.dealerId,
      }
      window.localStorage.setItem('new-tujjors-last-order-failed', JSON.stringify(payload))
      setStatus({
        tone: 'error',
        text: `${
          error.message || "Buyurtmani dealer serverga yuborib bo'lmadi."
        } Nusxa brauzerda saqlandi.`,
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="flex min-h-dvh flex-col overflow-hidden bg-app-bg">
      <StoreHeader
        ref={headerRef}
        categories={categories}
        products={products}
        search={search}
        onSearchChange={setSearch}
        selectedCategory={selectedCategory}
        onSelectAllCategories={selectAllCategories}
        onSelectCategory={selectCategory}
      />

      <section
        className="mx-auto flex w-full max-w-7xl min-h-0 flex-1 flex-col overflow-hidden px-4 py-4"
        style={{ marginTop: headerHeight }}
      >
        {status && (
          <div
            className={`card-radius mb-4 shrink-0 border px-4 py-3 text-sm font-medium ${ToneClasses[status.tone]}`}
          >
            {status.text}
          </div>
        )}

        <div className="mb-4 flex shrink-0 items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-app-text">
              {formatCount(filteredProducts.length)} ta mahsulot
            </p>
            <p className="text-sm text-app-text-soft">{selectedFilterLabel}</p>
          </div>
          {isProductsLoading && (
            <p className="text-sm font-medium text-app-text-soft">Yuklanmoqda...</p>
          )}
        </div>

        {bonus?.enabled && bonus?.show_in_catalog && bonus.brands?.length > 0 && (
          <div className="card-radius mb-4 shrink-0 border border-app-border bg-app-surface p-3 shadow-soft sm:p-4">
            <h2 className="text-base font-extrabold text-app-text sm:text-lg">{bonus.title}</h2>
            {bonus.description && (
              <p className="mt-1 text-xs text-app-text-soft sm:text-sm">{bonus.description}</p>
            )}
            <div className="mt-3 overflow-x-auto">
              <div className="flex flex-col gap-3">
                {bonus.brands.map((brand) => (
                  <BonusBrandOverviewRow key={brand.category_id} brand={brand} />
                ))}
              </div>
            </div>
          </div>
        )}

        {effectiveBonusBrand && (() => {
          const statusNode = (
            <p className="text-xs leading-tight whitespace-nowrap text-app-text-soft">
              Ushbu toifadagi bonusingiz: {formatCount(cartPointsForEffectiveBrand)} ball
              <span className="ml-1">
                (savatdagi summa: {formatPrice(cartAmountForEffectiveBrand)})
              </span>
            </p>
          )
          // Mobile expanded panel already shows the points count in the always-visible
          // collapsed bar above, so repeat only the cart amount here to avoid duplicate text.
          const mobileAmountNode = (
            <p className="text-[11px] leading-tight text-app-text-soft">
              Savatdagi summa: {formatPrice(cartAmountForEffectiveBrand)}
            </p>
          )

          const bonusBannerContent = (
            <BonusBrandRow
              brand={effectiveBonusBrand}
              statusNode={statusNode}
              mobileAmountNode={mobileAmountNode}
              points={cartPointsForEffectiveBrand}
              mobileExpanded={mobileBonusExpanded}
              onToggleMobileExpanded={() => setMobileBonusExpanded((current) => !current)}
            />
          )
          const bonusBannerWrapperClassName =
            'card-radius border border-app-accent bg-app-accent-soft px-3 py-2 shadow-soft sm:px-4 sm:py-3'

          return (
            <>
              <div className="fixed right-0 left-0 z-20" style={{ top: headerHeight }}>
                <div className="mx-auto w-full max-w-7xl px-4">
                  <div className={bonusBannerWrapperClassName}>{bonusBannerContent}</div>
                </div>
              </div>
              {/* Ghost clone: identical markup (same wrapper classes, same
                  bonusBannerContent, same mobileBonusExpanded state) rendered in
                  normal flow, invisible. It reserves exactly the layout space the
                  fixed copy occupies - collapsed or expanded - so the product grid
                  below never overlaps it, no measurement needed. */}
              <div className="invisible pointer-events-none" aria-hidden="true">
                <div className={bonusBannerWrapperClassName}>{bonusBannerContent}</div>
              </div>
            </>
          )
        })()}

        {isProductsLoading ? (
          <LoadingGrid />
        ) : filteredProducts.length === 0 ? (
          <EmptyGrid searchTerm={search} />
        ) : (
          <>
            <div className="grid mt-4 min-h-0 flex-1 grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
              {sectionedVisibleItems.map((item, index) => {
                if (item.type === 'header') {
                  return (
                    <div
                      key={`category-header-${item.categoryId ?? item.categoryName}-${index}`}
                      ref={setCategoryHeaderRef(item.categoryId)}
                      className="col-span-full mt-2 border-b border-app-border pb-2 text-base font-extrabold text-app-text first:mt-0"
                    >
                      {item.categoryName}
                    </div>
                  )
                }

                const { product } = item
                const productIndex = visibleProducts.indexOf(product)
                return (
                  <ProductCard
                    key={product.id}
                    product={product}
                    priority={productIndex < 6}
                    quantityInCart={cartQuantityById.get(product.id) || 0}
                    isEditorOpen={quantityEditor.productId === product.id}
                    editorQuantity={
                      quantityEditor.productId === product.id ? quantityEditor.quantity : '1'
                    }
                    onOpenEditor={openQuantityEditor}
                    onCloseEditor={closeQuantityEditor}
                    onChangeEditorQuantity={changeEditorQuantity}
                    onAdjustEditorQuantity={adjustEditorQuantity}
                    onSaveQuantity={saveEditorQuantity}
                  />
                )
              })}
            </div>

            {hasMoreProducts && (
              <div
                ref={loadMoreTriggerRef}
                className="flex min-h-24 items-center justify-center py-6 text-sm font-medium text-app-text-soft"
              >
                Ko&apos;proq mahsulotlar yuklanmoqda...
              </div>
            )}
          </>
        )}
      </section>

      <button
        type="button"
        onClick={() => setCartOpen(true)}
        aria-label="Savatni ochish"
        className="fixed right-4 bottom-4 z-30 inline-flex h-14 w-14 items-center justify-center rounded-full bg-app-text text-app-surface shadow-soft sm:right-6 sm:bottom-6"
      >
        <ShoppingCart size={22} />
        {totalItems > 0 && (
          <span className="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-app-danger px-1 text-[11px] font-bold text-white">
            {formatCount(totalItems)}
          </span>
        )}
      </button>

      <CartDrawer
        isOpen={cartOpen}
        cart={cart}
        customerForm={customerForm}
        isSubmitting={isSubmitting}
        onClose={() => setCartOpen(false)}
        onAdjustItemQuantity={adjustCartItemQuantity}
        onRemoveItem={removeFromCart}
        onUpdateItemQuantity={updateCartItemQuantity}
        validationErrors={visibleCustomerFormErrors}
        onFieldChange={handleCustomerFieldChange}
        onFieldBlur={handleCustomerFieldBlur}
        onSubmit={handleSubmit}
      />
    </main>
  )
}

export default StorePage
