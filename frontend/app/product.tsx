import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  ActivityIndicator,
  Modal,
  TextInput,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useCart } from '../contexts/CartContext';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

interface Product {
  _id: string;
  name: string;
  category: string;
  cutType: string;
  pricePerKg: number;
  description: string;
  available: boolean;
}

export default function ProductScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { addToCart } = useCart();
  const category = params.category as string;

  const [products, setProducts] = useState<Product[]>([]);
  const [filteredProducts, setFilteredProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCutType, setSelectedCutType] = useState<string>('All');
  const [showQuantityModal, setShowQuantityModal] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [quantity, setQuantity] = useState('0.5');
  const [presetQuantity, setPresetQuantity] = useState<number>(0.5);

  const cutTypes = ['All', 'Curry Cut', 'Bone-in', 'Boneless', 'Boneless & Mince', 'Whole', 'Tray'];

  useEffect(() => {
    fetchProducts();
  }, [category]);

  useEffect(() => {
    filterProducts();
  }, [selectedCutType, products]);

  const fetchProducts = async () => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/products/category/${category}`);
      const data = await response.json();
      setProducts(data);
      setFilteredProducts(data);
    } catch (error) {
      console.error('Fetch products error:', error);
    } finally {
      setLoading(false);
    }
  };

  const filterProducts = () => {
    if (selectedCutType === 'All') {
      setFilteredProducts(products);
    } else {
      setFilteredProducts(products.filter(p => p.cutType === selectedCutType));
    }
  };

  const handleAddToCart = (product: Product) => {
    setSelectedProduct(product);
    setQuantity('0.5');
    setPresetQuantity(0.5);
    setShowQuantityModal(true);
  };

  const confirmAddToCart = async () => {
    if (!selectedProduct) return;

    const qty = parseFloat(quantity);
    if (isNaN(qty) || qty <= 0) {
      alert('Please enter a valid quantity');
      return;
    }

    await addToCart(selectedProduct._id, qty);
    setShowQuantityModal(false);
    alert('Added to cart!');
  };

  const calculatePrice = () => {
    if (!selectedProduct) return 0;
    const qty = parseFloat(quantity) || 0;
    return (selectedProduct.pricePerKg * qty).toFixed(2);
  };

  const calculatePieces = () => {
    const qty = parseFloat(quantity) || 0;
    const minPieces = Math.floor(qty * 12);
    const maxPieces = Math.floor(qty * 18);
    return `${minPieces}-${maxPieces} pieces`;
  };

  const getCutTypeIcon = (cutType: string) => {
    switch (cutType) {
      case 'Curry Cut':
        return '🍖';
      case 'Bone-in':
        return '🦴';
      case 'Boneless':
        return '🍗';
      case 'Boneless & Mince':
        return '🥪';
      default:
        return '🍖';
    }
  };

  if (loading) {
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
        <Text style={styles.headerTitle}>{category}</Text>
        <TouchableOpacity onPress={() => router.push('/cart')} style={styles.cartButton}>
          <Ionicons name="cart" size={24} color="#FF6B35" />
        </TouchableOpacity>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.cutTypeScrollContainer}
        contentContainerStyle={styles.cutTypeContainer}
      >
        {cutTypes.map((cutType) => {
          const isAvailable = cutType === 'All' || products.some(p => p.cutType === cutType);
          if (!isAvailable && cutType !== 'All') return null;

          return (
            <TouchableOpacity
              key={cutType}
              style={[
                styles.cutTypeButton,
                selectedCutType === cutType && styles.cutTypeButtonActive,
              ]}
              onPress={() => setSelectedCutType(cutType)}
            >
              <Text style={styles.cutTypeIcon}>{getCutTypeIcon(cutType)}</Text>
              <Text
                style={[
                  styles.cutTypeText,
                  selectedCutType === cutType && styles.cutTypeTextActive,
                ]}
              >
                {cutType}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <ScrollView
        style={styles.content}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {filteredProducts.map((product) => (
          <View key={product._id} style={styles.productCard}>
            <View style={styles.productIconContainer}>
              <Text style={styles.productIcon}>{getCutTypeIcon(product.cutType)}</Text>
            </View>
            <View style={styles.productInfo}>
              <Text style={styles.productName}>{product.name}</Text>
              <Text style={styles.productCutType}>{product.cutType}</Text>
              <Text style={styles.productDescription}>{product.description}</Text>
              <View style={styles.priceRow}>
                <Text style={styles.productPrice}>₹{product.pricePerKg}/kg</Text>
                <TouchableOpacity
                  style={styles.addButton}
                  onPress={() => handleAddToCart(product)}
                >
                  <Ionicons name="add" size={20} color="#fff" />
                  <Text style={styles.addButtonText}>Add</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        ))}

        {filteredProducts.length === 0 && (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No products available</Text>
          </View>
        )}
      </ScrollView>

      <Modal
        visible={showQuantityModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowQuantityModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Enter Quantity</Text>
              <TouchableOpacity onPress={() => setShowQuantityModal(false)}>
                <Ionicons name="close" size={24} color="#333" />
              </TouchableOpacity>
            </View>

            <View style={styles.presetContainer}>
              {[0.25, 0.5, 0.75, 1].map((preset) => (
                <TouchableOpacity
                  key={preset}
                  style={[
                    styles.presetButton,
                    presetQuantity === preset && styles.presetButtonActive,
                  ]}
                  onPress={() => {
                    setPresetQuantity(preset);
                    setQuantity(preset.toString());
                  }}
                >
                  <Text
                    style={[
                      styles.presetButtonText,
                      presetQuantity === preset && styles.presetButtonTextActive,
                    ]}
                  >
                    {preset} kg
                  </Text>
                  <Text style={styles.presetPieces}>
                    {Math.floor(preset * 12)}-{Math.floor(preset * 18)} pcs
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.orText}>Or enter custom quantity</Text>

            <View style={styles.customInputContainer}>
              <TextInput
                style={styles.customInput}
                placeholder="Example: 1.25"
                keyboardType="decimal-pad"
                value={quantity}
                onChangeText={(text) => {
                  setQuantity(text);
                  setPresetQuantity(0);
                }}
              />
              <Text style={styles.customInputUnit}>kg</Text>
            </View>

            <View style={styles.quantityInfo}>
              <Text style={styles.quantityInfoText}>
                Approx: {calculatePieces()}
              </Text>
            </View>

            <View style={styles.priceContainer}>
              <Text style={styles.priceLabel}>Total Price</Text>
              <Text style={styles.totalPrice}>₹{calculatePrice()}</Text>
            </View>

            <TouchableOpacity
              style={styles.confirmButton}
              onPress={confirmAddToCart}
            >
              <Text style={styles.confirmButtonText}>Add to Cart</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
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
    flex: 1,
    textAlign: 'center',
  },
  cartButton: {
    padding: 4,
  },
  cutTypeScrollContainer: {
    maxHeight: 120,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  cutTypeContainer: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 12,
  },
  cutTypeButton: {
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#f9f9f9',
    minWidth: 80,
  },
  cutTypeButtonActive: {
    backgroundColor: '#FF6B35',
  },
  cutTypeIcon: {
    fontSize: 24,
    marginBottom: 4,
  },
  cutTypeText: {
    fontSize: 12,
    color: '#666',
    fontWeight: '500',
  },
  cutTypeTextActive: {
    color: '#fff',
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
  },
  productCard: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  productIconContainer: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#FFF5F0',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  productIcon: {
    fontSize: 28,
  },
  productInfo: {
    flex: 1,
  },
  productName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  productCutType: {
    fontSize: 14,
    color: '#FF6B35',
    marginBottom: 4,
  },
  productDescription: {
    fontSize: 13,
    color: '#666',
    marginBottom: 8,
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  productPrice: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#2E7D32',
  },
  addButton: {
    flexDirection: 'row',
    backgroundColor: '#FF6B35',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 16,
    alignItems: 'center',
    gap: 4,
  },
  addButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
  },
  emptyText: {
    fontSize: 16,
    color: '#999',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  presetContainer: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  presetButton: {
    flex: 1,
    backgroundColor: '#f9f9f9',
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  presetButtonActive: {
    backgroundColor: '#E8F5E9',
    borderColor: '#2E7D32',
  },
  presetButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  presetButtonTextActive: {
    color: '#2E7D32',
  },
  presetPieces: {
    fontSize: 11,
    color: '#999',
  },
  orText: {
    textAlign: 'center',
    fontSize: 14,
    color: '#999',
    marginBottom: 16,
  },
  customInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 12,
    paddingHorizontal: 16,
    backgroundColor: '#f9f9f9',
    marginBottom: 8,
  },
  customInput: {
    flex: 1,
    height: 50,
    fontSize: 16,
    color: '#333',
  },
  customInputUnit: {
    fontSize: 16,
    color: '#999',
    fontWeight: '600',
  },
  quantityInfo: {
    marginBottom: 24,
  },
  quantityInfoText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
  },
  priceContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#E8F5E9',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  priceLabel: {
    fontSize: 16,
    color: '#666',
  },
  totalPrice: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#2E7D32',
  },
  confirmButton: {
    backgroundColor: '#FF6B35',
    borderRadius: 12,
    height: 50,
    justifyContent: 'center',
    alignItems: 'center',
  },
  confirmButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
