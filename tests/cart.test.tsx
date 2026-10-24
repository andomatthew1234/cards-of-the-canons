import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { ProductCard } from '../src/components/ProductCard'
import { CartProvider, useCart } from '../src/context/CartContext'
import { demoProducts } from '../src/data/demo'
import { ProductDetail } from '../src/pages/ProductDetail'

function Count() { const { count } = useCart(); return <output aria-label="Cart count">{count}</output> }

describe('local demo cart', () => {
  beforeEach(() => localStorage.clear())
  it('adds a product and persists only its id and quantity', async () => {
    render(<MemoryRouter><CartProvider><ProductCard product={demoProducts[0]} /><Count /></CartProvider></MemoryRouter>)
    await userEvent.click(screen.getByRole('button', { name: /add to cart/i }))
    expect(screen.getByLabelText('Cart count')).toHaveTextContent('1')
    expect(screen.getByText('Added to cart')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /go to cart/i })).toHaveAttribute('href', '/cart')
    expect(localStorage.getItem('cards-of-the-canons:demo-cart')).toBe(JSON.stringify([{ productId: demoProducts[0].id, quantity: 1 }]))

    await userEvent.click(screen.getByRole('button', { name: `Add another ${demoProducts[0].name}` }))
    expect(screen.getByLabelText('Cart count')).toHaveTextContent('2')
    expect(screen.getByLabelText(`${demoProducts[0].name} quantity`)).toHaveTextContent('2')

    await userEvent.click(screen.getByRole('button', { name: `Decrease ${demoProducts[0].name} quantity` }))
    expect(screen.getByLabelText('Cart count')).toHaveTextContent('1')
  })

  it('reveals a dedicated cart destination on the product page after adding', async () => {
    const product = demoProducts[0]
    render(<MemoryRouter initialEntries={[`/product/${product.slug}`]}><CartProvider><Routes><Route path="/product/:slug" element={<ProductDetail />} /></Routes></CartProvider></MemoryRouter>)
    await userEvent.click(screen.getByRole('button', { name: 'Add to cart' }))
    expect(screen.getByRole('button', { name: 'Add another' })).toBeInTheDocument()
    expect(screen.getByText('Added to your cart')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /go to cart/i })).toHaveAttribute('href', '/cart')
  })

  it('does not offer cart actions for out-of-stock or zero-price products', () => {
    const unavailable = { ...demoProducts[0], stock: 0 }
    const unpriced = { ...demoProducts[1], priceCents: 0 }
    render(<MemoryRouter><CartProvider><ProductCard product={unavailable} /><ProductCard product={unpriced} /><Count /></CartProvider></MemoryRouter>)
    expect(screen.getByRole('button', { name: `${unavailable.name} is not available to purchase` })).toBeDisabled()
    expect(screen.getByRole('button', { name: `${unpriced.name} is not available to purchase` })).toBeDisabled()
    expect(screen.getByLabelText('Cart count')).toHaveTextContent('0')
  })

  it('limits product-card quantity controls to recorded stock', async () => {
    const limited = { ...demoProducts[0], stock: 1 }
    render(<MemoryRouter><CartProvider><ProductCard product={limited} /><Count /></CartProvider></MemoryRouter>)
    await userEvent.click(screen.getByRole('button', { name: /add to cart/i }))
    expect(screen.getByRole('button', { name: `Add another ${limited.name}` })).toBeDisabled()
  })
})
