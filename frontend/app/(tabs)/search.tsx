import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  FlatList,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../contexts/AuthContext';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

interface SearchResult {
  _id: string;
  name: string;
  category: string;
  cutType: string;
  pricePerKg: number;
  description: string;
  stock: number;
  rating: number;
}

export default function SearchScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [debounceTimer, setDebounceTimer] = useState<NodeJS.Timeout | null>(null);

  useEffect(() => {
    loadRecentSearches();
  }, [user]);

  const loadRecentSearches = async () => {
    if (!user) return;
    try {
      const response = await fetch(`${BACKEND_URL}/api/search/recent/${user._id}`);
      const data = await response.json();
      setRecentSearches(data.recentSearches || []);
    } catch (error) {
      console.error('Load recent searches error:', error);
    }
  };

  const fetchSuggestions = async (query: string) => {
    if (query.length < 2) {
      setSuggestions([]);
      return;
    }

    try {
      const response = await fetch(
        `${BACKEND_URL}/api/search/suggestions?q=${encodeURIComponent(query)}`
      );
      const data = await response.json();
      setSuggestions(data.suggestions || []);
      setShowSuggestions(true);
    } catch (error) {
      console.error('Fetch suggestions error:', error);
    }
  };

  const performSearch = async (query: string) => {
    if (!query.trim()) {
      setResults([]);
      return;
    }

    setLoading(true);
    setShowSuggestions(false);

    try {
      const response = await fetch(
        `${BACKEND_URL}/api/search?q=${encodeURIComponent(query)}${
          user ? `&userId=${user._id}` : ''
        }`
      );
      const data = await response.json();

      if (data.success) {
        setResults(data.results);
        // Refresh recent searches
        loadRecentSearches();
      }
    } catch (error) {
      console.error('Search error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSearchChange = (text: string) => {
    setSearchQuery(text);

    // Clear previous timer
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }

    if (text.trim()) {
      // Set new debounce timer for suggestions
      const timer = setTimeout(() => {
        fetchSuggestions(text);
      }, 300);
      setDebounceTimer(timer);
    } else {
      setSuggestions([]);
      setResults([]);
      setShowSuggestions(false);
    }
  };

  const handleSearchSubmit = () => {
    if (searchQuery.trim()) {
      performSearch(searchQuery);
    }
  };

  const handleSuggestionPress = (suggestion: string) => {
    setSearchQuery(suggestion);
    performSearch(suggestion);
  };

  const handleRecentSearchPress = (search: string) => {
    setSearchQuery(search);
    performSearch(search);
  };

  const clearSearch = () => {
    setSearchQuery('');
    setResults([]);
    setSuggestions([]);
    setShowSuggestions(false);
  };

  const clearRecentSearches = async () => {
    if (!user) return;
    try {
      await fetch(`${BACKEND_URL}/api/search/recent/${user._id}`, {
        method: 'DELETE',
      });
      setRecentSearches([]);
    } catch (error) {
      console.error('Clear recent searches error:', error);
    }
  };

  const renderProductCard = ({ item }: { item: SearchResult }) => (
    <TouchableOpacity
      style={styles.productCard}
      onPress={() =>
        router.push({
          pathname: '/product',
          params: { category: item.category },
        })
      }
    >
      <View style={styles.productIconContainer}>
        <Ionicons name="nutrition" size={32} color="#FF6B35" />
      </View>
      <View style={styles.productInfo}>
        <Text style={styles.productName}>{item.name}</Text>
        <Text style={styles.productCutType}>{item.cutType}</Text>
        <View style={styles.productFooter}>
          <Text style={styles.productPrice}>₹{item.pricePerKg}/kg</Text>
          <View style={styles.ratingContainer}>
            <Ionicons name="star" size={14} color="#FFB800" />
            <Text style={styles.ratingText}>{item.rating}</Text>
          </View>
        </View>
        {item.stock < 10 && item.stock > 0 && (
          <Text style={styles.lowStock}>Only {item.stock}kg left!</Text>
        )}
        {item.stock === 0 && (
          <Text style={styles.outOfStock}>Out of Stock</Text>
        )}
      </View>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.searchContainer}>
          <Ionicons name="search" size={20} color="#999" style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search for meat, eggs..."
            value={searchQuery}
            onChangeText={handleSearchChange}
            onSubmitEditing={handleSearchSubmit}
            returnKeyType="search"
            autoFocus
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={clearSearch} style={styles.clearButton}>
              <Ionicons name="close-circle" size={20} color="#999" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <ScrollView style={styles.content} keyboardShouldPersistTaps="handled">
        {/* Suggestions Dropdown */}
        {showSuggestions && suggestions.length > 0 && (
          <View style={styles.suggestionsContainer}>
            <Text style={styles.sectionTitle}>Suggestions</Text>
            {suggestions.map((suggestion, index) => (
              <TouchableOpacity
                key={index}
                style={styles.suggestionItem}
                onPress={() => handleSuggestionPress(suggestion)}
              >
                <Ionicons name="search" size={16} color="#666" />
                <Text style={styles.suggestionText}>{suggestion}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Recent Searches */}
        {!searchQuery && recentSearches.length > 0 && (
          <View style={styles.recentContainer}>
            <View style={styles.recentHeader}>
              <Text style={styles.sectionTitle}>Recent Searches</Text>
              <TouchableOpacity onPress={clearRecentSearches}>
                <Text style={styles.clearText}>Clear All</Text>
              </TouchableOpacity>
            </View>
            {recentSearches.map((search, index) => (
              <TouchableOpacity
                key={index}
                style={styles.recentItem}
                onPress={() => handleRecentSearchPress(search)}
              >
                <Ionicons name="time" size={16} color="#666" />
                <Text style={styles.recentText}>{search}</Text>
                <Ionicons name="arrow-forward" size={16} color="#ccc" />
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Loading State */}
        {loading && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#FF6B35" />
            <Text style={styles.loadingText}>Searching...</Text>
          </View>
        )}

        {/* Search Results */}
        {!loading && results.length > 0 && (
          <View style={styles.resultsContainer}>
            <Text style={styles.resultsCount}>
              Found {results.length} result{results.length !== 1 ? 's' : ''}
            </Text>
            <FlatList
              data={results}
              renderItem={renderProductCard}
              keyExtractor={(item) => item._id}
              scrollEnabled={false}
            />
          </View>
        )}

        {/* No Results */}
        {!loading && searchQuery.length > 0 && results.length === 0 && (
          <View style={styles.emptyContainer}>
            <Ionicons name="search-outline" size={64} color="#ccc" />
            <Text style={styles.emptyTitle}>No results found</Text>
            <Text style={styles.emptySubtitle}>
              Try searching for chicken, eggs, or meat
            </Text>
          </View>
        )}

        {/* Empty State */}
        {!searchQuery && recentSearches.length === 0 && (
          <View style={styles.emptyContainer}>
            <Ionicons name="search-outline" size={64} color="#ccc" />
            <Text style={styles.emptyTitle}>Search for Products</Text>
            <Text style={styles.emptySubtitle}>
              Find fresh meat, chicken, and eggs
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    paddingHorizontal: 12,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    height: 44,
    fontSize: 16,
    color: '#333',
  },
  clearButton: {
    padding: 4,
  },
  content: {
    flex: 1,
  },
  suggestionsContainer: {
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  suggestionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 12,
  },
  suggestionText: {
    fontSize: 16,
    color: '#333',
  },
  recentContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  recentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  clearText: {
    fontSize: 14,
    color: '#FF6B35',
    fontWeight: '600',
  },
  recentItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 12,
  },
  recentText: {
    flex: 1,
    fontSize: 16,
    color: '#666',
  },
  loadingContainer: {
    paddingVertical: 48,
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#666',
  },
  resultsContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  resultsCount: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
    marginBottom: 12,
  },
  productCard: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
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
    marginRight: 12,
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
    marginBottom: 8,
  },
  productFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  productPrice: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#2E7D32',
  },
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  ratingText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  lowStock: {
    fontSize: 12,
    color: '#FF6B35',
    marginTop: 4,
    fontWeight: '600',
  },
  outOfStock: {
    fontSize: 12,
    color: '#999',
    marginTop: 4,
    fontWeight: '600',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 64,
    paddingHorizontal: 32,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 16,
  },
  emptySubtitle: {
    fontSize: 16,
    color: '#666',
    marginTop: 8,
    textAlign: 'center',
  },
});
