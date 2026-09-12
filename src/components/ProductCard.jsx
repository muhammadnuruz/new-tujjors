import { useEffect, useState } from 'react'
import { ShoppingCart } from 'lucide-react'
import { formatPrice, formatPriceValue } from '../lib/format'

const useMonthEndCountdown = () => {
  const [text, setText] = useState('')

  useEffect(() => {
    const update = () => {
      const now = new Date()
      const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999)
      const remaining = Math.max(0, endOfMonth.getTime() - now.getTime())
      const totalSeconds = Math.floor(remaining / 1000)
      const days = Math.floor(totalSeconds / 86400)
      const hours = Math.floor((totalSeconds % 86400) / 3600)
      const minutes = Math.floor((totalSeconds % 3600) / 60)
      const seconds = totalSeconds % 60
      const pad = (value) => String(value).padStart(2, '0')

      setText(`${days}д ${pad(hours)}:${pad(minutes)}:${pad(seconds)}`)
    }

    update()
    const id = setInterval(update, 1000)

    return () => clearInterval(id)
  }, [])

  return text
}

const clampQuantity = (value) => {
  const parsed = Number.parseInt(value, 10)

  if (!Number.isFinite(parsed) || parsed < 1) {
    return 1
  }

  return parsed
}

export const ProductCardSkeleton = () => (
  <article
    className="card-radius max-w-125 mx-auto flex h-full w-full animate-pulse flex-col overflow-hidden border border-app-border bg-app-surface shadow-soft"
    aria-hidden="true"
  >
    <div className="relative w-full aspect-square overflow-hidden bg-app-surface-muted sm:h-56 md:h-64">
      <div className="absolute top-3 right-3 h-7 w-24 rounded-full bg-white/70" />
    </div>

    <div className="flex flex-1 flex-col p-3 md:p-4">
      <div className="min-h-0 flex-1">
        <div className="mt-3 h-5 w-4/5 rounded-full bg-app-surface-muted" />
        <div className="mt-2 h-5 w-3/5 rounded-full bg-app-surface-muted" />

        <div className="mt-4 flex items-center gap-2">
          <div className="h-4 w-4 rounded-full bg-app-surface-muted" />
          <div className="h-4 w-2/3 rounded-full bg-app-surface-muted" />
        </div>
      </div>

      <div className="mt-4">
        <div className="h-4 w-12 rounded-full bg-app-surface-muted" />
        <div className="mt-2 h-6 w-28 rounded-full bg-app-surface-muted" />
      </div>

      <div className="mt-4 h-12 rounded-2xl bg-app-surface-muted" />
    </div>
  </article>
)

const ProductCard = ({
  product,
  priority = false,
  quantityInCart,
  isEditorOpen,
  editorQuantity,
  onOpenEditor,
  onCloseEditor,
  onChangeEditorQuantity,
  onAdjustEditorQuantity,
  onSaveQuantity,
}) => {
  const parsedQuantity = clampQuantity(editorQuantity)
  const priceAmount = formatPriceValue(product.price)
  const comparePriceAmount = formatPriceValue(product.comparePrice)
  const countdownText = useMonthEndCountdown()
  const hasComparePrice = Boolean(product.comparePrice) && product.comparePrice !== product.price
  const isDiscount = hasComparePrice && product.comparePrice < product.price

  return (
    <article className="card-radius max-w-125 mx-auto flex h-full w-full flex-col overflow-hidden border border-app-border bg-app-surface shadow-soft">
      <div className="relative w-full aspect-square overflow-hidden bg-app-surface-muted">
        {product.packQuantity > 0 && !isEditorOpen && (
          <span className="absolute top-3 right-3 z-10 rounded-full bg-app-surface/95 px-3 py-1 text-xs font-semibold text-app-text shadow-sm backdrop-blur">
            Qadoq: {product.packQuantity} ta
          </span>
        )}

        {product.image ? (
          <img
            src={product.image}
            alt={product.name}
            className="h-full w-full object-contain"
            loading={priority ? 'eager' : 'lazy'}
            decoding="async"
            fetchPriority={priority ? 'high' : 'auto'}
            sizes="(min-width: 1024px) 33vw, (min-width: 768px) 50vw, 100vw"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center px-6 text-center text-sm font-semibold text-app-text-soft">
            Rasm mavjud emas
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col p-3 md:p-4">
        <div className="min-h-0 flex-1">
          {!isEditorOpen && (
            <>
              <h2 className="mt-3 line-clamp-2 text-sm font-bold text-app-text md:text-base">
                {product.name}
              </h2>
            </>
          )}
        </div>

        {!isEditorOpen && (
          <div className="mt-5 flex items-end justify-between gap-3">
            <div className="min-w-0 mb-2">
              {hasComparePrice ? (
                isDiscount ? (
                  <>
                    <div className="flex items-center gap-1.5">
                      <span className="rounded bg-red-500 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white">
                        СКИДКА
                      </span>
                      <span className="whitespace-nowrap text-xs font-medium text-app-text-soft line-through">
                        {priceAmount} so&apos;m
                      </span>
                    </div>
                    <div className="mt-1 whitespace-nowrap text-xl font-black leading-none tracking-[-0.04em] text-app-accent md:text-[26px]">
                      {comparePriceAmount} so&apos;m
                    </div>
                    <div className="mt-1 whitespace-nowrap text-[10px] text-app-text-soft">
                      Осталось: <span className="font-semibold text-orange-600">{countdownText}</span>
                    </div>
                  </>
                ) : (
                  <div className="rounded-xl border border-orange-200 bg-orange-50 px-2.5 py-2 text-center">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-orange-600">
                      Цена скоро вырастет
                    </p>
                    <p className="mt-1 text-[11px] text-app-text">
                      Ожидается рост цены до{' '}
                      <span className="font-bold text-orange-600">{comparePriceAmount} so&apos;m</span>
                    </p>
                    <p className="mt-1 text-[11px] text-app-text">
                      Сейчас: <span className="font-bold text-green-700">{priceAmount} so&apos;m</span>
                    </p>
                    <p className="mt-1 whitespace-nowrap text-[10px] font-medium text-orange-700">
                      Осталось: {countdownText}
                    </p>
                  </div>
                )
              ) : (
                <>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-app-text-soft">
                    Narxi:
                  </p>
                  <div className="mt-2 flex flex-wrap items-end gap-2">
                    <span className="whitespace-nowrap text-xl font-black leading-none tracking-[-0.04em] text-app-text md:text-[26px]">
                      {priceAmount} so&apos;m
                    </span>
                  </div>
                </>
              )}
            </div>

            <button
              type="button"
              onClick={() => onOpenEditor(product)}
              aria-label={quantityInCart > 0 ? 'Savatni yangilash' : "Savatga qo'shish"}
              className="inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border-2 border-app-accent bg-app-accent text-app-accent-contrast transition hover:opacity-90"
            >
              <ShoppingCart size={22} strokeWidth={2.1} />
            </button>
          </div>
        )}

        <div className="">
          {isEditorOpen ? (
            <div className="">
              <div className=" grid grid-cols-11 gap-2">
                {[-5, -1].map((step) => (
                  <button
                    key={step}
                    type="button"
                    onClick={() => onAdjustEditorQuantity(step)}
                    className="rounded-2xl border col-span-2 border-app-border bg-app-surface px-3 py-3 text-sm font-semibold text-app-text transition hover:bg-white"
                  >
                    {step}
                  </button>
                ))}

                <input
                  type="number"
                  inputMode="numeric"
                  min="1"
                  value={editorQuantity}
                  onChange={(event) => onChangeEditorQuantity(event.target.value)}
                  className="col-span-3 rounded-[1.4rem] border-2 border-app-accent bg-app-surface px-4 py-4 text-center text-2xl font-extrabold text-app-text shadow-[0_0_0_3px_rgba(15,118,110,0.14)] focus:outline-none"
                />

                {[1, 5].map((step) => (
                  <button
                    key={step}
                    type="button"
                    onClick={() => onAdjustEditorQuantity(step)}
                    className="rounded-2xl col-span-2 border border-app-border bg-app-surface px-3 py-3 text-sm font-semibold text-app-text transition hover:bg-white"
                  >
                    +{step}
                  </button>
                ))}
              </div>

              <div className=" rounded-2xl bg-app-surface px-4 py-3 text-sm text-app-text">
                Jami: <span className="font-extrabold">{formatPrice(product.price * parsedQuantity)}</span>
              </div>

              <div className="mt-1 flex gap-2">
                <button
                  type="button"
                  onClick={onCloseEditor}
                  className="rounded-2xl border border-app-border px-4 py-3 text-sm font-semibold text-app-text"
                >
                  Bekor
                </button>
                <button
                  type="button"
                  onClick={() => onSaveQuantity(product)}
                  className="flex-1 rounded-2xl bg-app-accent px-4 py-3 text-sm font-bold text-app-accent-contrast transition hover:opacity-90"
                >
                  {quantityInCart > 0 ? 'Savatni yangilash' : "Savatga qo'shish"}
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </article>
  )
}

export default ProductCard
