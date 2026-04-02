import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

interface OrderDetail {
  _id: string;
  orderNumber: string;
  items: any[];
  totalAmount: number;
  discount: number;
  finalAmount: number;
  orderStatus: string;
  paymentMethod: string;
  paymentStatus: string;
  address: any;
  statusHistory: any[];
  createdAt: string;
  estimatedDelivery: string;
  deliveryTime: number;
}

const statusSteps = [
  { key: 'placed', label: 'Order Placed', icon: 'checkmark-circle' },
  { key: 'confirmed', label: 'Confirmed', icon: 'checkbox' },
  { key: 'packed', label: 'Packed', icon: 'cube' },
  { key: 'out_for_delivery', label: 'Out for Delivery', icon: 'bicycle' },
  { key: 'delivered', label: 'Delivered', icon: 'home' },
];

export default function OrderDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const orderId = params.orderId as string;

  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (orderId) {
      fetchOrderDetail();
    }
  }, [orderId]);

  const fetchOrderDetail = async () => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/orders/${orderId}`);
      const data = await response.json();
      setOrder(data);
    } catch (error) {
      console.error('Fetch order detail error:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusIndex = (status: string) => {
    return statusSteps.findIndex((step) => step.key === status);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#FF6B35" />
      </View>
    );
  }

  if (!order) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle-outline" size={64} color="#ccc" />
          <Text style={styles.errorText}>Order not found</Text>
        </View>
      </SafeAreaView>
    );
  }

  const currentStatusIndex = getStatusIndex(order.orderStatus);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Order Details</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Order Status Card */}
        <View style={styles.statusCard}>
          <View style={styles.statusHeader}>
            <Text style={styles.orderNumber}>#{order.orderNumber}</Text>
            <Text style={styles.orderDate}>{formatDate(order.createdAt)}</Text>
          </View>

          {/* Status Tracker */}
          <View style={styles.statusTracker}>
            {statusSteps.map((step, index) => {
              const isCompleted = index <= currentStatusIndex;
              const isCurrent = index === currentStatusIndex;

              return (
                <View key={step.key} style={styles.statusStep}>
                  <View style={styles.statusIconContainer}>
                    <View
                      style={[
                        styles.statusIcon,
                        isCompleted && styles.statusIconCompleted,
                        isCurrent && styles.statusIconCurrent,
                      ]}
                    >
                      <Ionicons
                        name={step.icon as any}
                        size={20}
                        color={isCompleted ? '#fff' : '#ccc'}
                      />
                    </View>
                    {index < statusSteps.length - 1 && (
                      <View
                        style={[
                          styles.statusLine,
                          isCompleted && styles.statusLineCompleted,
                        ]}
                      />
                    )}
                  </View>
                  <View style={styles.statusLabel}>
                    <Text
                      style={[
                        styles.statusText,
                        isCompleted && styles.statusTextCompleted,
                        isCurrent && styles.statusTextCurrent,
                      ]}
                    >
                      {step.label}
                    </Text>
                    {order.statusHistory
                      .filter((h) => h.status === step.key)
                      .map((history, idx) => (
                        <Text key={idx} style={styles.statusTime}>
                          {formatDate(history.timestamp)}
                        </Text>
                      ))}
                  </View>
                </View>
              );
            })}
          </View>

          {order.orderStatus !== 'delivered' && (
            <View style={styles.deliveryInfo}>
              <Ionicons name="time" size={20} color="#FF6B35" />
              <Text style={styles.deliveryText}>
                Estimated delivery: {order.deliveryTime} minutes
              </Text>
            </View>
          )}
        </View>

        {/* Order Items */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Order Items</Text>
          {order.items.map((item, index) => (
            <View key={index} style={styles.orderItem}>
              <View style={styles.itemInfo}>
                <Text style={styles.itemName}>{item.productName}</Text>
                <Text style={styles.itemDetails}>
                  {item.cutType} • {item.quantity} kg
                </Text>
              </View>
              <Text style={styles.itemPrice}>₹{item.totalPrice.toFixed(2)}</Text>
            </View>
          ))}

          <View style={styles.priceSummary}>
            <View style={styles.priceRow}>
              <Text style={styles.priceLabel}>Subtotal</Text>
              <Text style={styles.priceValue}>₹{order.totalAmount.toFixed(2)}</Text>
            </View>
            {order.discount > 0 && (
              <View style={styles.priceRow}>
                <Text style={[styles.priceLabel, { color: '#2E7D32' }]}>
                  Discount
                </Text>
                <Text style={[styles.priceValue, { color: '#2E7D32' }]}>
                  -₹{order.discount.toFixed(2)}
                </Text>
              </View>
            )}
            <View style={styles.divider} />
            <View style={styles.priceRow}>
              <Text style={styles.totalLabel}>Total Amount</Text>
              <Text style={styles.totalValue}>₹{order.finalAmount.toFixed(2)}</Text>
            </View>
          </View>
        </View>

        {/* Delivery Address */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Delivery Address</Text>
          <View style={styles.addressCard}>
            <View style={styles.addressHeader}>
              <Ionicons name="location" size={20} color="#FF6B35" />
              <Text style={styles.addressLabel}>{order.address.label}</Text>
            </View>
            <Text style={styles.addressText}>{order.address.fullAddress}</Text>
            {order.address.landmark && (
              <Text style={styles.addressLandmark}>
                Landmark: {order.address.landmark}
              </Text>
            )}
            <Text style={styles.addressPincode}>Pincode: {order.address.pincode}</Text>
          </View>
        </View>

        {/* Payment Details */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Payment Details</Text>
          <View style={styles.paymentCard}>
            <View style={styles.paymentRow}>
              <Text style={styles.paymentLabel}>Payment Method</Text>
              <Text style={styles.paymentValue}>{order.paymentMethod}</Text>
            </View>
            <View style={styles.paymentRow}>
              <Text style={styles.paymentLabel}>Payment Status</Text>
              <View
                style={[
                  styles.paymentStatusBadge,
                  order.paymentStatus === 'completed' && styles.paymentStatusCompleted,
                ]}
              >
                <Text
                  style={[
                    styles.paymentStatusText,
                    order.paymentStatus === 'completed' &&
                      styles.paymentStatusTextCompleted,
                  ]}
                >
                  {order.paymentStatus.toUpperCase()}
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* Help Section */}
        <View style={styles.section}>
          <TouchableOpacity style={styles.helpButton}>
            <Ionicons name="help-circle" size={20} color="#FF6B35" />
            <Text style={styles.helpText}>Need Help?</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
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
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    fontSize: 18,
    color: '#666',
    marginTop: 16,
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
  content: {
    flex: 1,
  },
  statusCard: {
    backgroundColor: '#fff',
    padding: 20,
    marginBottom: 12,
  },
  statusHeader: {
    marginBottom: 24,
  },
  orderNumber: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  orderDate: {
    fontSize: 14,
    color: '#666',
  },
  statusTracker: {
    marginBottom: 16,
  },
  statusStep: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  statusIconContainer: {
    alignItems: 'center',
    marginRight: 16,
  },
  statusIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  statusIconCompleted: {
    backgroundColor: '#2E7D32',
  },
  statusIconCurrent: {
    backgroundColor: '#FF6B35',
  },
  statusLine: {
    width: 2,
    height: 24,
    backgroundColor: '#f0f0f0',
    marginTop: 4,
  },
  statusLineCompleted: {
    backgroundColor: '#2E7D32',
  },
  statusLabel: {
    flex: 1,
    paddingTop: 8,
  },
  statusText: {
    fontSize: 16,
    color: '#999',
    marginBottom: 2,
  },
  statusTextCompleted: {
    color: '#333',
    fontWeight: '500',
  },
  statusTextCurrent: {
    color: '#FF6B35',
    fontWeight: 'bold',
  },
  statusTime: {
    fontSize: 12,
    color: '#999',
  },
  deliveryInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF5F0',
    padding: 12,
    borderRadius: 8,
    gap: 8,
  },
  deliveryText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: '#FF6B35',
  },
  section: {
    backgroundColor: '#fff',
    padding: 20,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 16,
  },
  orderItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  itemInfo: {
    flex: 1,
  },
  itemName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  itemDetails: {
    fontSize: 14,
    color: '#666',
  },
  itemPrice: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#2E7D32',
  },
  priceSummary: {
    marginTop: 12,
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  priceLabel: {
    fontSize: 16,
    color: '#666',
  },
  priceValue: {
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
  },
  divider: {
    height: 1,
    backgroundColor: '#f0f0f0',
    marginVertical: 8,
  },
  totalLabel: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  totalValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#2E7D32',
  },
  addressCard: {
    backgroundColor: '#f9f9f9',
    padding: 16,
    borderRadius: 8,
  },
  addressHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 8,
  },
  addressLabel: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FF6B35',
  },
  addressText: {
    fontSize: 16,
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
  paymentCard: {
    backgroundColor: '#f9f9f9',
    padding: 16,
    borderRadius: 8,
  },
  paymentRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  paymentLabel: {
    fontSize: 16,
    color: '#666',
  },
  paymentValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  paymentStatusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: '#FFE0B2',
  },
  paymentStatusCompleted: {
    backgroundColor: '#C8E6C9',
  },
  paymentStatusText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#F57C00',
  },
  paymentStatusTextCompleted: {
    color: '#2E7D32',
  },
  helpButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: '#FF6B35',
    borderRadius: 8,
  },
  helpText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FF6B35',
  },
});
