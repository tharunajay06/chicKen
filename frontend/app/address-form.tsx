import React, { useState } from 'react';
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
  Switch,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../contexts/AuthContext';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

export default function AddressFormScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const params = useLocalSearchParams();

  const mode = params.mode as 'add' | 'edit';
  const addressId = params.addressId as string;

  const [label, setLabel] = useState(params.label as string || 'Home');
  const [fullAddress, setFullAddress] = useState(params.fullAddress as string || '');
  const [landmark, setLandmark] = useState(params.landmark as string || '');
  const [pincode, setPincode] = useState(params.pincode as string || '');
  const [isDefault, setIsDefault] = useState(params.isDefault === 'true');
  const [loading, setLoading] = useState(false);

  const labelOptions = ['Home', 'Work', 'Other'];

  const validateForm = () => {
    if (!fullAddress.trim()) {
      Alert.alert('Error', 'Please enter full address');
      return false;
    }
    if (!pincode.trim() || pincode.length !== 6) {
      Alert.alert('Error', 'Please enter valid 6-digit pincode');
      return false;
    }
    return true;
  };

  const handleSaveAddress = async () => {
    if (!validateForm() || !user) return;

    setLoading(true);

    try {
      const addressData = {
        label,
        fullAddress: fullAddress.trim(),
        landmark: landmark.trim(),
        pincode: pincode.trim(),
        isDefault,
      };

      let response;

      if (mode === 'add') {
        response = await fetch(`${BACKEND_URL}/api/addresses/add`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: user._id,
            address: addressData,
          }),
        });
      } else {
        response = await fetch(
          `${BACKEND_URL}/api/addresses/update/${user._id}/${addressId}`,
          {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(addressData),
          }
        );
      }

      if (response.ok) {
        Alert.alert(
          'Success',
          mode === 'add' ? 'Address added successfully' : 'Address updated successfully',
          [{ text: 'OK', onPress: () => router.back() }]
        );
      } else {
        Alert.alert('Error', 'Failed to save address');
      }
    } catch (error) {
      console.error('Save address error:', error);
      Alert.alert('Error', 'Failed to save address');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>
          {mode === 'add' ? 'Add Address' : 'Edit Address'}
        </Text>
        <View style={{ width: 24 }} />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView
          style={styles.content}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* Address Label */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Address Type</Text>
            <View style={styles.labelOptions}>
              {labelOptions.map((option) => (
                <TouchableOpacity
                  key={option}
                  style={[
                    styles.labelOption,
                    label === option && styles.labelOptionActive,
                  ]}
                  onPress={() => setLabel(option)}
                >
                  <Ionicons
                    name={
                      option === 'Home'
                        ? 'home'
                        : option === 'Work'
                        ? 'briefcase'
                        : 'location'
                    }
                    size={20}
                    color={label === option ? '#fff' : '#666'}
                  />
                  <Text
                    style={[
                      styles.labelOptionText,
                      label === option && styles.labelOptionTextActive,
                    ]}
                  >
                    {option}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Full Address */}
          <View style={styles.section}>
            <Text style={styles.label}>
              Full Address <Text style={styles.required}>*</Text>
            </Text>
            <TextInput
              style={styles.textArea}
              placeholder="House/Flat No., Street, Area"
              value={fullAddress}
              onChangeText={setFullAddress}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />
          </View>

          {/* Landmark */}
          <View style={styles.section}>
            <Text style={styles.label}>Landmark (Optional)</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g., Near Park, Opposite Mall"
              value={landmark}
              onChangeText={setLandmark}
            />
          </View>

          {/* Pincode */}
          <View style={styles.section}>
            <Text style={styles.label}>
              Pincode <Text style={styles.required}>*</Text>
            </Text>
            <TextInput
              style={styles.input}
              placeholder="Enter 6-digit pincode"
              value={pincode}
              onChangeText={(text) => setPincode(text.replace(/[^0-9]/g, ''))}
              keyboardType="number-pad"
              maxLength={6}
            />
          </View>

          {/* Set as Default */}
          <View style={styles.section}>
            <View style={styles.switchRow}>
              <View style={styles.switchLabel}>
                <Text style={styles.switchTitle}>Set as Default Address</Text>
                <Text style={styles.switchSubtitle}>
                  This will be your default delivery address
                </Text>
              </View>
              <Switch
                value={isDefault}
                onValueChange={setIsDefault}
                trackColor={{ false: '#ddd', true: '#FFB399' }}
                thumbColor={isDefault ? '#FF6B35' : '#f4f3f4'}
              />
            </View>
          </View>

          {/* Save Button */}
          <TouchableOpacity
            style={[styles.saveButton, loading && styles.saveButtonDisabled]}
            onPress={handleSaveAddress}
            disabled={loading}
          >
            <Text style={styles.saveButtonText}>
              {loading ? 'Saving...' : mode === 'add' ? 'Add Address' : 'Update Address'}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
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
    padding: 20,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 12,
  },
  labelOptions: {
    flexDirection: 'row',
    gap: 12,
  },
  labelOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#f9f9f9',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 12,
    paddingVertical: 12,
  },
  labelOptionActive: {
    backgroundColor: '#FF6B35',
    borderColor: '#FF6B35',
  },
  labelOptionText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  labelOptionTextActive: {
    color: '#fff',
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  required: {
    color: '#D32F2F',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: '#333',
    backgroundColor: '#fff',
  },
  textArea: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: '#333',
    backgroundColor: '#fff',
    minHeight: 100,
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
  },
  switchLabel: {
    flex: 1,
    marginRight: 16,
  },
  switchTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  switchSubtitle: {
    fontSize: 14,
    color: '#666',
  },
  saveButton: {
    backgroundColor: '#FF6B35',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  saveButtonDisabled: {
    backgroundColor: '#FFB399',
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
