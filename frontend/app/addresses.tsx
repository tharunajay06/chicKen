import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
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

export default function AddressesScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      fetchAddresses();
    }
  }, [user]);

  const fetchAddresses = async () => {
    if (!user) return;

    try {
      const response = await fetch(`${BACKEND_URL}/api/addresses/${user._id}`);
      const data = await response.json();
      setAddresses(data.addresses || []);
    } catch (error) {
      console.error('Fetch addresses error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteAddress = (addressId: string) => {
    Alert.alert(
      'Delete Address',
      'Are you sure you want to delete this address?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => deleteAddress(addressId),
        },
      ]
    );
  };

  const deleteAddress = async (addressId: string) => {
    if (!user) return;

    try {
      const response = await fetch(
        `${BACKEND_URL}/api/addresses/delete/${user._id}/${addressId}`,
        { method: 'DELETE' }
      );

      if (response.ok) {
        setAddresses(addresses.filter((addr) => addr.id !== addressId));
        Alert.alert('Success', 'Address deleted successfully');
      }
    } catch (error) {
      console.error('Delete address error:', error);
      Alert.alert('Error', 'Failed to delete address');
    }
  };

  const handleEditAddress = (address: Address) => {
    router.push({
      pathname: '/address-form',
      params: {
        mode: 'edit',
        addressId: address.id,
        label: address.label,
        fullAddress: address.fullAddress,
        landmark: address.landmark || '',
        pincode: address.pincode,
        isDefault: address.isDefault.toString(),
      },
    });
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
        <Text style={styles.headerTitle}>My Addresses</Text>
        <TouchableOpacity
          onPress={() => router.push('/address-form?mode=add')}
          style={styles.addButton}
        >
          <Ionicons name="add" size={24} color="#FF6B35" />
        </TouchableOpacity>
      </View>

      {addresses.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="location-outline" size={64} color="#ccc" />
          <Text style={styles.emptyTitle}>No Addresses Saved</Text>
          <Text style={styles.emptySubtitle}>Add your delivery address</Text>
          <TouchableOpacity
            style={styles.addAddressButton}
            onPress={() => router.push('/address-form?mode=add')}
          >
            <Ionicons name="add-circle" size={20} color="#fff" />
            <Text style={styles.addAddressText}>Add Address</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          style={styles.content}
          contentContainerStyle={styles.scrollContent}
        >
          {addresses.map((address) => (
            <View key={address.id} style={styles.addressCard}>
              <View style={styles.addressHeader}>
                <View style={styles.addressLabelContainer}>
                  <Ionicons
                    name={
                      address.label === 'Home'
                        ? 'home'
                        : address.label === 'Work'
                        ? 'briefcase'
                        : 'location'
                    }
                    size={20}
                    color="#FF6B35"
                  />
                  <Text style={styles.addressLabel}>{address.label}</Text>
                  {address.isDefault && (
                    <View style={styles.defaultBadge}>
                      <Text style={styles.defaultText}>Default</Text>
                    </View>
                  )}
                </View>
                <View style={styles.addressActions}>
                  <TouchableOpacity
                    onPress={() => handleEditAddress(address)}
                    style={styles.actionButton}
                  >
                    <Ionicons name="pencil" size={18} color="#666" />
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => handleDeleteAddress(address.id)}
                    style={styles.actionButton}
                  >
                    <Ionicons name="trash" size={18} color="#D32F2F" />
                  </TouchableOpacity>
                </View>
              </View>

              <Text style={styles.addressText}>{address.fullAddress}</Text>
              {address.landmark && (
                <Text style={styles.landmarkText}>
                  Landmark: {address.landmark}
                </Text>
              )}
              <Text style={styles.pincodeText}>Pincode: {address.pincode}</Text>
            </View>
          ))}

          <TouchableOpacity
            style={styles.addMoreButton}
            onPress={() => router.push('/address-form?mode=add')}
          >
            <Ionicons name="add-circle-outline" size={20} color="#FF6B35" />
            <Text style={styles.addMoreText}>Add New Address</Text>
          </TouchableOpacity>
        </ScrollView>
      )}
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
  addButton: {
    padding: 4,
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  addressCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  addressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  addressLabelContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  addressLabel: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
  defaultBadge: {
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  defaultText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#2E7D32',
  },
  addressActions: {
    flexDirection: 'row',
    gap: 12,
  },
  actionButton: {
    padding: 4,
  },
  addressText: {
    fontSize: 15,
    color: '#333',
    lineHeight: 22,
    marginBottom: 8,
  },
  landmarkText: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  pincodeText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  addMoreButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    borderWidth: 2,
    borderColor: '#FF6B35',
    borderStyle: 'dashed',
  },
  addMoreText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FF6B35',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  emptyTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 16,
  },
  emptySubtitle: {
    fontSize: 16,
    color: '#666',
    marginTop: 8,
    marginBottom: 24,
  },
  addAddressButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FF6B35',
    borderRadius: 12,
    paddingHorizontal: 24,
    paddingVertical: 14,
  },
  addAddressText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
