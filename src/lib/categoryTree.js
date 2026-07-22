export const ALL_CATEGORIES = 'All'

const FALLBACK_CATEGORY_TREE = [
  { name: 'Smartphones', count: 0 },
  { name: 'Accessories', count: 0 },
  { name: 'Gadgets', count: 0 },
]

const resolveCategoryName = (item) =>
  item?.name || item?.categoryName || item?.productCategoryName || item?.title || ''

const resolveCategoryId = (item) =>
  item?.id || item?.CS_id || item?.SD_id || item?.code_1C || resolveCategoryName(item)

const isVisibleCategory = (category) => {
  const active = typeof category?.active === 'string' ? category.active.trim().toUpperCase() : ''
  return !active || active === 'Y'
}

const resolveProductSortValue = (product) =>
  Number.isFinite(product?.sortId) ? product.sortId : Number.MAX_SAFE_INTEGER

const compareCatalogItems = (leftItem, rightItem) => {
  if (leftItem.sortOrder !== rightItem.sortOrder) {
    return leftItem.sortOrder - rightItem.sortOrder
  }
  return String(leftItem.name).localeCompare(String(rightItem.name))
}

export const getCategoryKey = (category) => category.key || category.name

export const buildCategoryList = (categories, products = []) => {
  const productCounts = products.reduce((accumulator, product) => {
    const categoryName = product?.category
    if (!categoryName) return accumulator
    accumulator[categoryName] = (accumulator[categoryName] || 0) + 1
    return accumulator
  }, {})

  const productSortOrders = products.reduce((accumulator, product) => {
    const categoryName = product?.category
    const sortValue = resolveProductSortValue(product)
    if (!categoryName) return accumulator
    accumulator[categoryName] = Math.min(
      accumulator[categoryName] ?? Number.MAX_SAFE_INTEGER,
      sortValue,
    )
    return accumulator
  }, {})

  const mappedCategories = categories
    .filter(isVisibleCategory)
    .map((category) => {
      const categoryName = resolveCategoryName(category)
      const categoryId = resolveCategoryId(category)
      if (!categoryName) return null
      return {
        key: `${categoryId || categoryName}-${categoryName}`,
        name: categoryName,
        count: productCounts[categoryName] || 0,
        sortOrder: productSortOrders[categoryName] ?? Number.MAX_SAFE_INTEGER,
      }
    })
    .filter(Boolean)
    .sort(compareCatalogItems)

  if (mappedCategories.length > 0) {
    return mappedCategories
  }

  return FALLBACK_CATEGORY_TREE.map((category) => ({
    ...category,
    count: productCounts[category.name] || 0,
    sortOrder: productSortOrders[category.name] ?? Number.MAX_SAFE_INTEGER,
  }))
}
