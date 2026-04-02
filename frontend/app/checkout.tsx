import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useCart } from '../contexts/CartContext';
import { useAuth } from '../contexts/AuthContext';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

interface Address {
  id: string;
  label: string;
  fullAddress: string;
  landmark?: string;
  pincode: string;
  isDefault: boolean;
}

interface Coupon {
  code: string;
  discountType: string;
  discountValue: number;
  minOrderValue: number;
  maxDiscount?: number;
}

export default function CheckoutScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { items, totalAmount, discount, finalAmount, appliedCoupon, applyCoupon, removeCoupon } = useCart();

  const [addresses, setAddresses] = useState<Address[]>([]);
  const [selectedAddress, setSelectedAddress] = useState<Address | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<'COD' | 'Online'>('COD');
  const [loading, setLoading] = useState(false);
  const [loadingAddresses, setLoadingAddresses] = useState(true);
  const [couponCode, setCouponCode] = useState('');
  const [applyingCoupon, setApplyingCoupon] = useState(false);
  const [availableCoupons, setAvailableCoupons] = useState<Coupon[]>([]);
  const [showCoupons, setShowCoupons] = useState(false);

  useEffect(() => {
    if (user) {
      fetchAddresses();
      fetchAvailableCoupons();
    }
  }, [user]);

  const fetchAddresses = async () => {
    if (!user) return;

    try {
      const response = await fetch(`${BACKEND_URL}/api/addresses/${user._id}`);
      const data = await response.json();
      const userAddresses = data.addresses || [];
      setAddresses(userAddresses);

      // Auto-select default address
      const defaultAddr = userAddresses.find((addr: Address) => addr.isDefault);
      if (defaultAddr) {
        setSelectedAddress(defaultAddr);
      } else if (userAddresses.length > 0) {
        setSelectedAddress(userAddresses[0]);
      }
    } catch (error) {
      console.error('Fetch addresses error:', error);
    } finally {
      setLoadingAddresses(false);
    }
  };

  const fetchAvailableCoupons = async () => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/coupons/available`);
      const data = await response.json();
      setAvailableCoupons(data);
    } catch (error) {
      console.error('Fetch coupons error:', error);
    }
  };

  const handleApplyCoupon = async (code?: string) => {
    const codeToApply = code || couponCode;
    if (!codeToApply.trim()) {
      Alert.alert('Error', 'Please enter coupon code');
      return;
    }

    setApplyingCoupon(true);
    try {
      await applyCoupon(codeToApply);
      setCouponCode('');
      setShowCoupons(false);
      Alert.alert('Success', 'Coupon applied successfully!');
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Invalid coupon code');
    } finally {
      setApplyingCoupon(false);
    }
  };

  const handleRemoveCoupon = async () => {
    try {
      await removeCoupon();
      Alert.alert('Success', 'Coupon removed');
    } catch (error) {
      console.error('Remove coupon error:', error);
    }
  };

  const handlePlaceOrder = async () => {
    if (!selectedAddress) {
      Alert.alert('Error', 'Please select delivery address');
      return;
    }

    if (!user) {
      Alert.alert('Error', 'Please login to continue');
      return;
    }

    if (items.length === 0) {
      Alert.alert('Error', 'Your cart is empty');
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(`${BACKEND_URL}/api/orders`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: user._id,
          addressId: selectedAddress.id,
          paymentMethod,
        }),
      });

      const data = await response.json();

      if (data.success) {
        router.replace('/order-success');
      } else {
        Alert.alert('Error', data.detail || 'Failed to place order');
      }
    } catch (error: any) {
      console.error('Place order error:', error);
      Alert.alert('Error', error.message || 'Failed to place order');
    } finally {
      setLoading(false);
    }
  };

  if (loadingAddresses) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#FF6B35" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Checkout</Text>
        <View style={{ width: 24 }} />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView
          style={styles.content}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {/* Delivery Address */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Delivery Address</Text>
              <TouchableOpacity
                onPress={() => router.push('/addresses')}
                style={styles.manageButton}
              >
                <Text style={styles.manageButtonText}>Manage</Text>
              </TouchableOpacity>
            </View>

            {addresses.length === 0 ? (
              <TouchableOpacity
                style={styles.addAddressButton}
                onPress={() => router.push('/address-form?mode=add')}
              >
                <Ionicons name="add-circle" size={20} color="#FF6B35" />
                <Text style={styles.addAddressText}>Add Delivery Address</Text>
              </TouchableOpacity>
            ) : (
              <>
                {selectedAddress && (
                  <View style={styles.selectedAddress}>
                    <View style={styles.addressHeader}>
                      <Ionicons name="location" size={20} color="#FF6B35" />
                      <Text style={styles.addressLabel}>{selectedAddress.label}</Text>
                    </View>
                    <Text style={styles.addressText}>{selectedAddress.fullAddress}</Text>
                    {selectedAddress.landmark && (
                      <Text style={styles.addressLandmark}>
                        Landmark: {selectedAddress.landmark}
                      </Text>
                    )}
                    <Text style={styles.addressPincode}>
                      Pincode: {selectedAddress.pincode}
                    </Text>
                  </View>
                )}

                {addresses.length > 1 && (
                  <TouchableOpacity
                    style={styles.changeAddressButton}
                    onPress={() => router.push('/addresses')}
                  >
                    <Text style={styles.changeAddressText}>Change Address</Text>
                  </TouchableOpacity>
                )}
              </>
            )}
          </View>

          {/* Order Summary */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Order Summary</Text>
            {items.map((item, index) => (
              <View key={index} style={styles.orderItem}>
                <View style={styles.orderItemInfo}>
                  <Text style={styles.orderItemName}>{item.productName}</Text>
                  <Text style={styles.orderItemDetails}>
                    {item.cutType} • {item.quantity} kg
                  </Text>
                </View>
                <Text style={styles.orderItemPrice}>₹{item.price.toFixed(2)}</Text>
              </View>
            ))}
          </View>

          {/* Coupon Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Apply Coupon</Text>

            {appliedCoupon ? (
              <View style={styles.appliedCouponCard}>
                <View style={styles.appliedCouponInfo}>
                  <Ionicons name="checkmark-circle" size={24} color="#2E7D32" />
                  <View style={styles.appliedCouponText}>
                    <Text style={styles.appliedCouponCode}>{appliedCoupon}</Text>
                    <Text style={styles.appliedCouponDiscount}>
                      You saved ₹{discount.toFixed(2)}!
                    </Text>
                  </View>
                </View>
                <TouchableOpacity onPress={handleRemoveCoupon}>
                  <Ionicons name="close-circle" size={24} color="#D32F2F" />
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <View style={styles.couponInputContainer}>
                  <TextInput
                    style={styles.couponInput}
                    placeholder="Enter coupon code"
                    value={couponCode}
                    onChangeText={setCouponCode}
                    autoCapitalize="characters"
                  />
                  <TouchableOpacity
                    style={[styles.applyButton, applyingCoupon && styles.applyButtonDisabled]}
                    onPress={() => handleApplyCoupon()}
                    disabled={applyingCoupon}
                  >
                    <Text style={styles.applyButtonText}>
                      {applyingCoupon ? 'Applying...' : 'Apply'}
                    </Text>
                  </TouchableOpacity>
                </View>

                {availableCoupons.length > 0 && (
                  <>
                    <TouchableOpacity
                      style={styles.viewCouponsButton}
                      onPress={() => setShowCoupons(!showCoupons)}
                    >
                      <Text style={styles.viewCouponsText}>
                        {availableCoupons.length} coupon{availableCoupons.length !== 1 ? 's' : ''}{' '}
                        available
                      </Text>
                      <Ionicons
                        name={showCoupons ? 'chevron-up' : 'chevron-down'}
                        size={20}
                        color="#FF6B35"
                      />
                    </TouchableOpacity>

                    {showCoupons && (
                      <View style={styles.couponsContainer}>
                        {availableCoupons.map((coupon, index) => (
                          <TouchableOpacity
                            key={index}
                            style={styles.couponCard}
                            onPress={() => handleApplyCoupon(coupon.code)}
                          >
                            <View style={styles.couponCardHeader}>
                              <Text style={styles.couponCardCode}>{coupon.code}</Text>
                              <TouchableOpacity
                                style={styles.couponCardApply}
                                onPress={() => handleApplyCoupon(coupon.code)}
                              >
                                <Text style={styles.couponCardApplyText}>APPLY</Text>
                              </TouchableOpacity>
                            </View>
                            <Text style={styles.couponCardDetails}>
                              {coupon.discountType === 'percentage'
                                ? `${coupon.discountValue}% off`
                                : `₹${coupon.discountValue} off`}
                              {coupon.minOrderValue > 0 &&
                                ` on orders above ₹${coupon.minOrderValue}`}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}
                  </>
                )}
              </>
            )}
          </View>

          {/* Payment Method */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Payment Method</Text>

            <TouchableOpacity
              style={[
                styles.paymentOption,
                paymentMethod === 'COD' && styles.paymentOptionActive,
              ]}
              onPress={() => setPaymentMethod('COD')}
            >
              <View style={styles.paymentOptionContent}>
                <Ionicons name="cash" size={24} color="#FF6B35" />
                <View style={styles.paymentOptionInfo}>
                  <Text style={styles.paymentOptionTitle}>Cash on Delivery</Text>
                  <Text style={styles.paymentOptionSubtitle}>Pay when you receive</Text>
                </View>
              </View>
              <View
                style={[styles.radio, paymentMethod === 'COD' && styles.radioActive]}
              >
                {paymentMethod === 'COD' && <View style={styles.radioInner} />}
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.paymentOption,
                paymentMethod === 'Online' && styles.paymentOptionActive,
              ]}
              onPress={() => setPaymentMethod('Online')}
            >
              <View style={styles.paymentOptionContent}>
                <Ionicons name="card" size={24} color="#FF6B35" />
                <View style={styles.paymentOptionInfo}>
                  <Text style={styles.paymentOptionTitle}>Online Payment</Text>
                  <Text style={styles.paymentOptionSubtitle}>
                    UPI, Cards, Net Banking
                  </Text>
                </View>
              </View>
              <View
                style={[styles.radio, paymentMethod === 'Online' && styles.radioActive]}
              >
                {paymentMethod === 'Online' && <View style={styles.radioInner} />}
              </View>
            </TouchableOpacity>
          </View>

          {/* Price Breakdown */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Bill Details</Text>
            <View style={styles.billDetails}>
              <View style={styles.billRow}>
                <Text style={styles.billLabel}>Item Total</Text>
                <Text style={styles.billValue}>₹{totalAmount.toFixed(2)}</Text>
              </View>
              {discount > 0 && (
                <View style={styles.billRow}>
                  <Text style={[styles.billLabel, { color: '#2E7D32' }]}>
                    Coupon Discount
                  </Text>
                  <Text style={[styles.billValue, { color: '#2E7D32' }]}>
                    -₹{discount.toFixed(2)}
                  </Text>
                </View>
              )}
              <View style={styles.billDivider} />
              <View style={styles.billRow}>
                <Text style={styles.billTotal}>To Pay</Text>
                <Text style={styles.billTotalValue}>₹{finalAmount.toFixed(2)}</Text>
              </View>
            </View>
          </View>

          {/* Delivery Info */}
          <View style={styles.deliveryInfo}>
            <Ionicons name="flash" size={20} color="#FF6B35" />
            <Text style={styles.deliveryInfoText}>
              Your order will be delivered in 20 minutes
            </Text>
          </View>
        </ScrollView>

        <View style={styles.footer}>
          <View style={styles.footerTotal}>
            <Text style={styles.footerTotalLabel}>Total</Text>
            <Text style={styles.footerTotalValue}>₹{finalAmount.toFixed(2)}</Text>
          </View>
          <TouchableOpacity
            style={[styles.placeOrderButton, loading && styles.placeOrderButtonDisabled]}
            onPress={handlePlaceOrder}
            disabled={loading || !selectedAddress}
          >
            <Text style={styles.placeOrderButtonText}>
              {loading ? 'Placing Order...' : 'Place Order'}
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  keyboardView: {
    flex: 1,
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 100,
  },
  section: {
    backgroundColor: '#fff',
    padding: 20,
    marginBottom: 12,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  manageButton: {
    paddingVertical: 4,
    paddingHorizontal: 12,
  },
  manageButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FF6B35',
  },
  selectedAddress: {
    backgroundColor: '#f9f9f9',
    padding: 16,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#FF6B35',
  },
  addressHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  addressLabel: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FF6B35',
  },
  addressText: {
    fontSize: 15,
    color: '#333',
    marginBottom: 4,
    lineHeight: 22,
  },
  addressLandmark: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  addressPincode: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  changeAddressButton: {
    marginTop: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#FF6B35',
    borderRadius: 8,
    alignItems: 'center',
  },
  changeAddressText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FF6B35',
  },
  addAddressButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    borderWidth: 2,
    borderColor: '#FF6B35',
    borderRadius: 12,
    borderStyle: 'dashed',
  },
  addAddressText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FF6B35',
  },
  orderItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  orderItemInfo: {
    flex: 1,
  },
  orderItemName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  orderItemDetails: {
    fontSize: 14,
    color: '#666',
  },
  orderItemPrice: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#2E7D32',
  },
  couponInputContainer: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  couponInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: '#333',
    textTransform: 'uppercase',
  },
  applyButton: {
    backgroundColor: '#FF6B35',
    borderRadius: 12,
    paddingHorizontal: 24,
    justifyContent: 'center',
  },
  applyButtonDisabled: {
    backgroundColor: '#FFB399',
  },
  applyButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  appliedCouponCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#E8F5E9',
    padding: 16,
    borderRadius: 12,
  },
  appliedCouponInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 12,
  },
  appliedCouponText: {
    flex: 1,
  },
  appliedCouponCode: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#2E7D32',
    marginBottom: 2,
  },
  appliedCouponDiscount: {
    fontSize: 14,
    color: '#2E7D32',
  },
  viewCouponsButton: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
  },
  viewCouponsText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FF6B35',
  },
  couponsContainer: {
    marginTop: 8,
  },
  couponCard: {
    backgroundColor: '#FFF5F0',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#FFE0CC',
  },
  couponCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  couponCardCode: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FF6B35',
  },
  couponCardApply: {
    backgroundColor: '#FF6B35',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 6,
  },
  couponCardApplyText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  couponCardDetails: {
    fontSize: 14,
    color: '#666',
  },
  paymentOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 2,
    borderColor: '#f0f0f0',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    backgroundColor: '#fff',
  },
  paymentOptionActive: {
    borderColor: '#FF6B35',
    backgroundColor: '#FFF5F0',
  },
  paymentOptionContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  paymentOptionInfo: {
    marginLeft: 16,
  },
  paymentOptionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  paymentOptionSubtitle: {
    fontSize: 14,
    color: '#666',
  },
  radio: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#ddd',
    justifyContent: 'center',
    alignItems: 'center',
  },
  radioActive: {
    borderColor: '#FF6B35',
  },
  radioInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#FF6B35',
  },
  billDetails: {
    backgroundColor: '#f9f9f9',
    padding: 16,
    borderRadius: 12,
  },
  billRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  billLabel: {
    fontSize: 16,
    color: '#666',
  },
  billValue: {
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
  },
  billDivider: {
    height: 1,
    backgroundColor: '#e0e0e0',
    marginVertical: 8,
  },
  billTotal: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  billTotalValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#2E7D32',
  },
  deliveryInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF5F0',
    padding: 16,
    marginHorizontal: 12,
    marginBottom: 12,
    borderRadius: 12,
    gap: 12,
  },
  deliveryInfoText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: '#FF6B35',
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#fff',
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  footerTotal: {
    flex: 1,
  },
  footerTotalLabel: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  footerTotalValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#2E7D32',
  },
  placeOrderButton: {
    backgroundColor: '#FF6B35',
    borderRadius: 12,
    paddingHorizontal: 32,
    paddingVertical: 14,
  },
  placeOrderButtonDisabled: {
    backgroundColor: '#FFB399',
  },
  placeOrderButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
