import React, { createContext, useContext, useState, useEffect } from 'react';
import { useAuth } from './AuthContext';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

interface CartItem {
  productId: string;
  productName: string;
  cutType: string;
  quantity: number;
  price: number;
}

interface CartContextType {
  items: CartItem[];
  totalAmount: number;
  addToCart: (productId: string, quantity: number) => Promise<void>;
  updateCart: (productId: string, quantity: number) => Promise<void>;
  removeFromCart: (productId: string) => Promise<void>;
  clearCart: () => void;
  refreshCart: () => Promise<void>;
  itemCount: number;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [totalAmount, setTotalAmount] = useState(0);
  const { user } = useAuth();

  useEffect(() => {
    if (user) {
      refreshCart();
    }
  }, [user]);

  const refreshCart = async () => {
    if (!user) return;

    try {
      const response = await fetch(`${BACKEND_URL}/api/cart/${user._id}`);
      const data = await response.json();

      setItems(data.items || []);
      setTotalAmount(data.total || 0);
    } catch (error) {
      console.error('Refresh cart error:', error);
    }
  };

  const addToCart = async (productId: string, quantity: number) => {
    if (!user) return;

    try {
      const response = await fetch(`${BACKEND_URL}/api/cart/add`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: user._id,
          productId,
          quantity,
        }),
      });

      if (response.ok) {
        await refreshCart();
      }
    } catch (error) {
      console.error('Add to cart error:', error);
    }
  };

  const updateCart = async (productId: string, quantity: number) => {
    if (!user) return;

    try {
      const response = await fetch(`${BACKEND_URL}/api/cart/update`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: user._id,
          productId,
          quantity,
        }),
      });

      if (response.ok) {
        await refreshCart();
      }
    } catch (error) {
      console.error('Update cart error:', error);
    }
  };

  const removeFromCart = async (productId: string) => {
    if (!user) return;

    try {
      const response = await fetch(`${BACKEND_URL}/api/cart/remove`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: user._id,
          productId,
        }),
      });

      if (response.ok) {
        await refreshCart();
      }
    } catch (error) {
      console.error('Remove from cart error:', error);
    }
  };

  const clearCart = () => {
    setItems([]);
    setTotalAmount(0);
  };

  return (
    <CartContext.Provider
      value={{
        items,
        totalAmount,
        addToCart,
        updateCart,
        removeFromCart,
        clearCart,
        refreshCart,
        itemCount: items.length,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const context = useContext(CartContext);
  if (context === undefined) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
}
