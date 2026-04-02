import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from './AuthContext';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;
const CART_STORAGE_KEY = '@meat_delivery_cart';

interface CartItem {
  productId: string;
  productName: string;
  cutType: string;
  quantity: number;
  price: number;
  pricePerKg: number;
}

interface CartContextType {
  items: CartItem[];
  totalAmount: number;
  discount: number;
  finalAmount: number;
  appliedCoupon: string | null;
  addToCart: (productId: string, quantity: number) => Promise<void>;
  updateCart: (productId: string, quantity: number) => Promise<void>;
  removeFromCart: (productId: string) => Promise<void>;
  clearCart: () => void;
  refreshCart: () => Promise<void>;
  applyCoupon: (couponCode: string) => Promise<boolean>;
  removeCoupon: () => Promise<void>;
  itemCount: number;
  isLoading: boolean;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [totalAmount, setTotalAmount] = useState(0);
  const [discount, setDiscount] = useState(0);
  const [finalAmount, setFinalAmount] = useState(0);
  const [appliedCoupon, setAppliedCoupon] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const { user } = useAuth();

  // Load cart from AsyncStorage on mount
  useEffect(() => {
    loadCartFromStorage();
  }, []);

  // Sync with backend when user logs in
  useEffect(() => {
    if (user) {
      syncCartWithBackend();
    }
  }, [user]);

  // Save cart to AsyncStorage whenever it changes
  useEffect(() => {
    saveCartToStorage();
  }, [items, totalAmount, discount, appliedCoupon]);

  const loadCartFromStorage = async () => {
    try {
      const cartData = await AsyncStorage.getItem(CART_STORAGE_KEY);
      if (cartData) {
        const cart = JSON.parse(cartData);
        setItems(cart.items || []);
        setTotalAmount(cart.totalAmount || 0);
        setDiscount(cart.discount || 0);
        setFinalAmount(cart.finalAmount || 0);
        setAppliedCoupon(cart.appliedCoupon || null);
      }
    } catch (error) {
      console.error('Load cart from storage error:', error);
    }
  };

  const saveCartToStorage = async () => {
    try {
      const cartData = {
        items,
        totalAmount,
        discount,
        finalAmount,
        appliedCoupon,
        lastUpdated: new Date().toISOString(),
      };
      await AsyncStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cartData));
    } catch (error) {
      console.error('Save cart to storage error:', error);
    }
  };

  const syncCartWithBackend = async () => {
    if (!user) return;

    try {
      // Get backend cart
      const response = await fetch(`${BACKEND_URL}/api/cart/${user._id}`);
      const backendCart = await response.json();

      // If backend cart has items, use it; otherwise keep local cart
      if (backendCart.items && backendCart.items.length > 0) {
        setItems(backendCart.items);
        setTotalAmount(backendCart.total || 0);
        setDiscount(backendCart.discount || 0);
        setFinalAmount(backendCart.finalTotal || 0);
        setAppliedCoupon(backendCart.appliedCoupon || null);
      } else if (items.length > 0) {
        // Upload local cart to backend
        for (const item of items) {
          await fetch(`${BACKEND_URL}/api/cart/add`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userId: user._id,
              productId: item.productId,
              quantity: item.quantity,
            }),
          });
        }
        await refreshCart();
      }
    } catch (error) {
      console.error('Sync cart error:', error);
    }
  };

  const refreshCart = async () => {
    if (!user) return;

    setIsLoading(true);
    try {
      const response = await fetch(`${BACKEND_URL}/api/cart/${user._id}`);
      const data = await response.json();

      setItems(data.items || []);
      setTotalAmount(data.total || 0);
      setDiscount(data.discount || 0);
      setFinalAmount(data.finalTotal || 0);
      setAppliedCoupon(data.appliedCoupon || null);
    } catch (error) {
      console.error('Refresh cart error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const addToCart = async (productId: string, quantity: number) => {
    if (!user) {
      // If not logged in, add to local cart
      // This would need product details - simplified for now
      return;
    }

    setIsLoading(true);
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

      const data = await response.json();

      if (response.ok) {
        await refreshCart();
      } else {
        throw new Error(data.detail || 'Failed to add to cart');
      }
    } catch (error: any) {
      console.error('Add to cart error:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const updateCart = async (productId: string, quantity: number) => {
    if (!user) return;

    setIsLoading(true);
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
    } finally {
      setIsLoading(false);
    }
  };

  const removeFromCart = async (productId: string) => {
    if (!user) return;

    setIsLoading(true);
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
    } finally {
      setIsLoading(false);
    }
  };

  const applyCoupon = async (couponCode: string): Promise<boolean> => {
    if (!user) return false;

    setIsLoading(true);
    try {
      const response = await fetch(`${BACKEND_URL}/api/cart/apply-coupon`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: user._id,
          couponCode,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        await refreshCart();
        return true;
      } else {
        throw new Error(data.detail || 'Invalid coupon');
      }
    } catch (error: any) {
      console.error('Apply coupon error:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const removeCoupon = async () => {
    if (!user) return;

    setIsLoading(true);
    try {
      await fetch(`${BACKEND_URL}/api/cart/remove-coupon/${user._id}`, {
        method: 'DELETE',
      });
      await refreshCart();
    } catch (error) {
      console.error('Remove coupon error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const clearCart = () => {
    setItems([]);
    setTotalAmount(0);
    setDiscount(0);
    setFinalAmount(0);
    setAppliedCoupon(null);
    AsyncStorage.removeItem(CART_STORAGE_KEY);
  };

  return (
    <CartContext.Provider
      value={{
        items,
        totalAmount,
        discount,
        finalAmount,
        appliedCoupon,
        addToCart,
        updateCart,
        removeFromCart,
        clearCart,
        refreshCart,
        applyCoupon,
        removeCoupon,
        itemCount: items.length,
        isLoading,
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
