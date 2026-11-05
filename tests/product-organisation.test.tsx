import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { demoProducts } from '../src/data/demo'
import { prepareProductForSave, ProductEditorPage } from '../src/pages/admin/ProductEditorPage'
import { ProductsPage } from '../src/pages/admin/ProductsPage'

const mocks = vi.hoisted(() => ({
  upsertProduct: vi.fn(),
  runAction: vi.fn(),
  refresh: vi.fn(),
  products: [] as typeof demoProducts,
}))

vi.mock('../src/admin/AdminContext', () => ({
  useAdminData: () => ({
    products: mocks.products,
    loading: false,
    errors: {},
    busy: '',
    runAction: mocks.runAction,
    refresh: mocks.refresh,
  }),
}))
vi.mock('../src/admin/utils', () => ({ useUnsavedChanges: () => vi.fn() }))
vi.mock('../src/lib/data', () => ({
  deleteProduct: vi.fn(),
  listProductMedia: vi.fn().mockResolvedValue([]),
  uploadProductImage: vi.fn(),
  upsertProduct: mocks.upsertProduct,
}))

describe('product category and storefront order editing', () => {
  beforeEach(() => {
    mocks.products = [...demoProducts]
    mocks.upsertProduct.mockReset().mockResolvedValue(undefined)
    mocks.refresh.mockReset().mockResolvedValue(undefined)
    mocks.runAction.mockReset().mockImplementation(async (_key: string, action: () => Promise<void>) => {
      await action()
      return true
    })
  })

  it('offers existing categories, permits a new category and persists its storefront order', async () => {
    const product = demoProducts[0]
    render(
      <MemoryRouter initialEntries={[`/admin/products/${product.id}`]}>
        <Routes><Route path="/admin/products/:id" element={<ProductEditorPage />} /></Routes>
      </MemoryRouter>,
    )

    const category = await screen.findByRole('combobox', { name: 'Category' })
    expect(category).toHaveValue('Card packs')
    await userEvent.selectOptions(category, '__new__')
    await userEvent.type(screen.getByPlaceholderText('Only needed for a new category'), '  Limited   editions  ')

    const order = screen.getByLabelText(/Storefront order/i)
    await userEvent.clear(order)
    await userEvent.type(order, '42')
    await userEvent.click(screen.getByRole('button', { name: 'Save product' }))

    expect(mocks.upsertProduct).toHaveBeenCalledWith(expect.objectContaining({
      id: product.id,
      category: 'Limited editions',
      sortOrder: 42,
    }))
  })

  it('uses an explicit category picker with a clear create-category path', async () => {
    const product = demoProducts[0]
    render(
      <MemoryRouter initialEntries={[`/admin/products/${product.id}`]}>
        <Routes><Route path="/admin/products/:id" element={<ProductEditorPage />} /></Routes>
      </MemoryRouter>,
    )

    const categoryPicker = await screen.findByRole('combobox', { name: 'Category' })
    expect(categoryPicker).toHaveValue('Card packs')
    expect(screen.getByPlaceholderText('Only needed for a new category')).toHaveValue('')

    await userEvent.selectOptions(categoryPicker, '__new__')
    const newCategory = screen.getByPlaceholderText('Only needed for a new category')
    await userEvent.type(newCategory, 'Limited editions')

    await userEvent.click(screen.getByRole('button', { name: 'Save product' }))
    expect(mocks.upsertProduct).toHaveBeenCalledWith(expect.objectContaining({
      category: 'Limited editions',
    }))
  })

  it('lets an administrator move products directly in storefront order', async () => {
    mocks.products = [
      { ...demoProducts[0], id: 'first', name: 'First', sortOrder: 10 },
      { ...demoProducts[1], id: 'second', name: 'Second', sortOrder: 20 },
      { ...demoProducts[2], id: 'third', name: 'Third', sortOrder: 30 },
    ]

    render(<MemoryRouter><ProductsPage /></MemoryRouter>)

    await userEvent.click(screen.getByRole('button', { name: 'Move Second up' }))

    expect(mocks.upsertProduct).toHaveBeenCalledWith(expect.objectContaining({ id: 'second', sortOrder: 10 }))
    expect(mocks.upsertProduct).toHaveBeenCalledWith(expect.objectContaining({ id: 'first', sortOrder: 20 }))
  })

  it('makes a legacy product valid for Firestore when only its category or order is edited', () => {
    const legacyProduct = { ...demoProducts[0], treasuryCardsPerUnit: undefined } as unknown as typeof demoProducts[number]

    expect(prepareProductForSave(legacyProduct, legacyProduct.slug)).toMatchObject({
      category: legacyProduct.category,
      sortOrder: legacyProduct.sortOrder,
      treasuryCardsPerUnit: 0,
    })
  })

  it('reloads administrator-managed categories in the products filter and matches them case-insensitively', async () => {
    mocks.products = [
      { ...demoProducts[0], id: 'limited-one', name: 'Limited One', category: 'Limited editions', sortOrder: 42 },
      { ...demoProducts[0], id: 'archive', name: 'Archive Product', category: 'Archive', sortOrder: 5 },
      { ...demoProducts[0], id: 'limited-two', name: 'Limited Two', category: 'limited editions', sortOrder: 12 },
    ]

    render(<MemoryRouter><ProductsPage /></MemoryRouter>)

    const categoryFilter = screen.getByLabelText('Filter by category')
    expect(categoryFilter.querySelectorAll('option')).toHaveLength(3)
    await userEvent.selectOptions(categoryFilter, 'limited editions')

    expect(screen.getByText('Limited One')).toBeInTheDocument()
    expect(screen.getByText('Limited Two')).toBeInTheDocument()
    expect(screen.queryByText('Archive Product')).not.toBeInTheDocument()
    expect(screen.getByRole('cell', { name: '42' })).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: '12' })).toBeInTheDocument()
  })
})
