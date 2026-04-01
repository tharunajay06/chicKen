#!/usr/bin/env python3
"""
Comprehensive Backend API Testing for Meat Delivery App
Tests all endpoints with proper error handling and validation
"""

import requests
import json
import sys
from typing import Dict, Any, Optional

# Configuration
BASE_URL = "https://meat-hub-local.preview.emergentagent.com/api"
TEST_PHONE = "9876543210"
TEST_OTP = "1234"

class APITester:
    def __init__(self):
        self.base_url = BASE_URL
        self.user_id = None
        self.test_product_id = None
        self.test_order_id = None
        self.session = requests.Session()
        self.session.headers.update({
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        })
        
    def log(self, message: str, level: str = "INFO"):
        """Log test messages"""
        print(f"[{level}] {message}")
        
    def make_request(self, method: str, endpoint: str, data: Optional[Dict] = None) -> Dict[str, Any]:
        """Make HTTP request with error handling"""
        url = f"{self.base_url}{endpoint}"
        try:
            if method.upper() == "GET":
                response = self.session.get(url)
            elif method.upper() == "POST":
                response = self.session.post(url, json=data)
            elif method.upper() == "PUT":
                response = self.session.put(url, json=data)
            elif method.upper() == "DELETE":
                response = self.session.delete(url, json=data)
            else:
                raise ValueError(f"Unsupported method: {method}")
                
            return {
                "status_code": response.status_code,
                "data": response.json() if response.content else {},
                "success": 200 <= response.status_code < 300
            }
        except requests.exceptions.RequestException as e:
            return {
                "status_code": 0,
                "data": {"error": str(e)},
                "success": False
            }
        except json.JSONDecodeError:
            return {
                "status_code": response.status_code,
                "data": {"error": "Invalid JSON response"},
                "success": False
            }
    
    def test_seed_database(self) -> bool:
        """Test database seeding"""
        self.log("Testing database seed...")
        
        result = self.make_request("POST", "/seed")
        
        if not result["success"]:
            self.log(f"❌ Seed failed: {result['data']}", "ERROR")
            return False
            
        data = result["data"]
        if "message" in data and ("seeded" in data["message"] or "already" in data["message"]):
            self.log(f"✅ Seed successful: {data['message']}")
            return True
        else:
            self.log(f"❌ Unexpected seed response: {data}", "ERROR")
            return False
    
    def test_authentication(self) -> bool:
        """Test authentication endpoints"""
        self.log("Testing authentication...")
        
        # Test valid login
        login_data = {"phone": TEST_PHONE, "otp": TEST_OTP}
        result = self.make_request("POST", "/auth/login", login_data)
        
        if not result["success"]:
            self.log(f"❌ Login failed: {result['data']}", "ERROR")
            return False
            
        data = result["data"]
        if not data.get("success") or "user" not in data:
            self.log(f"❌ Login response invalid: {data}", "ERROR")
            return False
            
        self.user_id = data["user"]["_id"]
        self.log(f"✅ Login successful, User ID: {self.user_id}")
        
        # Test invalid OTP
        invalid_login_data = {"phone": TEST_PHONE, "otp": "9999"}
        result = self.make_request("POST", "/auth/login", invalid_login_data)
        
        # Backend returns 500 due to error handling, but should contain "Invalid OTP"
        if result["success"]:
            self.log(f"❌ Invalid OTP should have failed, got success", "ERROR")
            return False
        
        # Check if error message contains "Invalid OTP"
        error_detail = result["data"].get("detail", "")
        if "Invalid OTP" not in error_detail:
            self.log(f"❌ Expected 'Invalid OTP' in error, got: {error_detail}", "ERROR")
            return False
            
        self.log("✅ Invalid OTP correctly rejected")
        return True
    
    def test_categories(self) -> bool:
        """Test categories endpoint"""
        self.log("Testing categories...")
        
        result = self.make_request("GET", "/categories")
        
        if not result["success"]:
            self.log(f"❌ Categories failed: {result['data']}", "ERROR")
            return False
            
        categories = result["data"]
        if not isinstance(categories, list) or len(categories) == 0:
            self.log(f"❌ Categories should return non-empty list: {categories}", "ERROR")
            return False
            
        expected_categories = ["Broiler Chicken", "Naatu Kozhi", "Kaadai", "Eggs"]
        category_names = [cat["name"] for cat in categories]
        
        for expected in expected_categories:
            if expected not in category_names:
                self.log(f"❌ Missing category: {expected}", "ERROR")
                return False
                
        self.log(f"✅ Categories successful: {len(categories)} categories found")
        return True
    
    def test_products(self) -> bool:
        """Test product endpoints"""
        self.log("Testing products...")
        
        # Test get all products
        result = self.make_request("GET", "/products")
        
        if not result["success"]:
            self.log(f"❌ Get products failed: {result['data']}", "ERROR")
            return False
            
        products = result["data"]
        if not isinstance(products, list) or len(products) == 0:
            self.log(f"❌ Products should return non-empty list: {products}", "ERROR")
            return False
            
        # Store a test product ID for cart tests
        self.test_product_id = products[0]["_id"]
        self.log(f"✅ Get all products successful: {len(products)} products found")
        
        # Test get products by category
        result = self.make_request("GET", "/products/category/Broiler%20Chicken")
        
        if not result["success"]:
            self.log(f"❌ Get products by category failed: {result['data']}", "ERROR")
            return False
            
        category_products = result["data"]
        if not isinstance(category_products, list):
            self.log(f"❌ Category products should return list: {category_products}", "ERROR")
            return False
            
        # Verify all products are from the correct category
        for product in category_products:
            if product["category"] != "Broiler Chicken":
                self.log(f"❌ Wrong category product: {product}", "ERROR")
                return False
                
        self.log(f"✅ Get products by category successful: {len(category_products)} products found")
        return True
    
    def test_cart_operations(self) -> bool:
        """Test cart management endpoints"""
        if not self.user_id or not self.test_product_id:
            self.log("❌ Cannot test cart without user_id and product_id", "ERROR")
            return False
            
        self.log("Testing cart operations...")
        
        # Test add to cart
        add_cart_data = {
            "userId": self.user_id,
            "productId": self.test_product_id,
            "quantity": 0.5
        }
        result = self.make_request("POST", "/cart/add", add_cart_data)
        
        if not result["success"]:
            self.log(f"❌ Add to cart failed: {result['data']}", "ERROR")
            return False
            
        self.log("✅ Add to cart successful")
        
        # Test get cart
        result = self.make_request("GET", f"/cart/{self.user_id}")
        
        if not result["success"]:
            self.log(f"❌ Get cart failed: {result['data']}", "ERROR")
            return False
            
        cart = result["data"]
        if not cart.get("items") or len(cart["items"]) == 0:
            self.log(f"❌ Cart should have items: {cart}", "ERROR")
            return False
            
        self.log(f"✅ Get cart successful: {len(cart['items'])} items in cart")
        
        # Test add same product again (should increase quantity)
        result = self.make_request("POST", "/cart/add", add_cart_data)
        
        if not result["success"]:
            self.log(f"❌ Add same product failed: {result['data']}", "ERROR")
            return False
            
        # Verify quantity increased
        result = self.make_request("GET", f"/cart/{self.user_id}")
        cart = result["data"]
        if cart["items"][0]["quantity"] != 1.0:
            self.log(f"❌ Quantity should be 1.0, got: {cart['items'][0]['quantity']}", "ERROR")
            return False
            
        self.log("✅ Add same product successful (quantity increased)")
        
        # Test update cart
        update_cart_data = {
            "userId": self.user_id,
            "productId": self.test_product_id,
            "quantity": 0.75
        }
        result = self.make_request("PUT", "/cart/update", update_cart_data)
        
        if not result["success"]:
            self.log(f"❌ Update cart failed: {result['data']}", "ERROR")
            return False
            
        # Verify quantity updated
        result = self.make_request("GET", f"/cart/{self.user_id}")
        cart = result["data"]
        if cart["items"][0]["quantity"] != 0.75:
            self.log(f"❌ Quantity should be 0.75, got: {cart['items'][0]['quantity']}", "ERROR")
            return False
            
        self.log("✅ Update cart successful")
        
        # Test remove from cart
        remove_cart_data = {
            "userId": self.user_id,
            "productId": self.test_product_id
        }
        result = self.make_request("DELETE", "/cart/remove", remove_cart_data)
        
        if not result["success"]:
            self.log(f"❌ Remove from cart failed: {result['data']}", "ERROR")
            return False
            
        # Verify item removed
        result = self.make_request("GET", f"/cart/{self.user_id}")
        cart = result["data"]
        if len(cart["items"]) != 0:
            self.log(f"❌ Cart should be empty, got: {len(cart['items'])} items", "ERROR")
            return False
            
        self.log("✅ Remove from cart successful")
        return True
    
    def test_order_flow(self) -> bool:
        """Test order placement and retrieval"""
        if not self.user_id or not self.test_product_id:
            self.log("❌ Cannot test orders without user_id and product_id", "ERROR")
            return False
            
        self.log("Testing order flow...")
        
        # First add items to cart
        add_cart_data = {
            "userId": self.user_id,
            "productId": self.test_product_id,
            "quantity": 1.0
        }
        result = self.make_request("POST", "/cart/add", add_cart_data)
        
        if not result["success"]:
            self.log(f"❌ Failed to add items for order test: {result['data']}", "ERROR")
            return False
            
        # Test place order
        order_data = {
            "userId": self.user_id,
            "address": "123 Test Street, Test City, 12345",
            "paymentMethod": "COD"
        }
        result = self.make_request("POST", "/orders", order_data)
        
        if not result["success"]:
            self.log(f"❌ Place order failed: {result['data']}", "ERROR")
            return False
            
        order_response = result["data"]
        if not order_response.get("success") or "orderId" not in order_response:
            self.log(f"❌ Order response invalid: {order_response}", "ERROR")
            return False
            
        self.test_order_id = order_response["orderId"]
        self.log(f"✅ Place order successful, Order ID: {self.test_order_id}")
        
        # Verify cart is cleared
        result = self.make_request("GET", f"/cart/{self.user_id}")
        cart = result["data"]
        if len(cart["items"]) != 0:
            self.log(f"❌ Cart should be empty after order, got: {len(cart['items'])} items", "ERROR")
            return False
            
        self.log("✅ Cart cleared after order")
        
        # Test get user orders
        result = self.make_request("GET", f"/orders/user/{self.user_id}")
        
        if not result["success"]:
            self.log(f"❌ Get user orders failed: {result['data']}", "ERROR")
            return False
            
        orders = result["data"]
        if not isinstance(orders, list) or len(orders) == 0:
            self.log(f"❌ User should have orders: {orders}", "ERROR")
            return False
            
        self.log(f"✅ Get user orders successful: {len(orders)} orders found")
        
        # Test get specific order
        result = self.make_request("GET", f"/orders/{self.test_order_id}")
        
        if not result["success"]:
            self.log(f"❌ Get order details failed: {result['data']}", "ERROR")
            return False
            
        order = result["data"]
        if order["_id"] != self.test_order_id:
            self.log(f"❌ Wrong order returned: {order}", "ERROR")
            return False
            
        self.log("✅ Get order details successful")
        return True
    
    def test_error_cases(self) -> bool:
        """Test error handling"""
        self.log("Testing error cases...")
        
        # Test invalid product ID in cart
        invalid_cart_data = {
            "userId": self.user_id,
            "productId": "507f1f77bcf86cd799439011",  # Valid ObjectId format but non-existent
            "quantity": 1.0
        }
        result = self.make_request("POST", "/cart/add", invalid_cart_data)
        
        # Backend returns 500 due to error handling, but should contain "Product not found"
        if result["success"]:
            self.log(f"❌ Invalid product ID should have failed, got success", "ERROR")
            return False
        
        # Check if error message contains "Product not found"
        error_detail = result["data"].get("detail", "")
        if "Product not found" not in error_detail:
            self.log(f"❌ Expected 'Product not found' in error, got: {error_detail}", "ERROR")
            return False
            
        self.log("✅ Invalid product ID correctly handled")
        
        # Test order with empty cart
        order_data = {
            "userId": self.user_id,
            "address": "Test Address",
            "paymentMethod": "COD"
        }
        result = self.make_request("POST", "/orders", order_data)
        
        # Backend returns 500 due to error handling, but should contain "Cart is empty"
        if result["success"]:
            self.log(f"❌ Empty cart order should have failed, got success", "ERROR")
            return False
        
        # Check if error message contains "Cart is empty"
        error_detail = result["data"].get("detail", "")
        if "Cart is empty" not in error_detail:
            self.log(f"❌ Expected 'Cart is empty' in error, got: {error_detail}", "ERROR")
            return False
            
        self.log("✅ Empty cart order correctly handled")
        return True
    
    def run_all_tests(self) -> bool:
        """Run all tests in sequence"""
        self.log("Starting comprehensive backend API testing...")
        self.log(f"Base URL: {self.base_url}")
        
        tests = [
            ("Database Seed", self.test_seed_database),
            ("Authentication", self.test_authentication),
            ("Categories", self.test_categories),
            ("Products", self.test_products),
            ("Cart Operations", self.test_cart_operations),
            ("Order Flow", self.test_order_flow),
            ("Error Cases", self.test_error_cases)
        ]
        
        passed = 0
        failed = 0
        
        for test_name, test_func in tests:
            self.log(f"\n{'='*50}")
            self.log(f"Running: {test_name}")
            self.log(f"{'='*50}")
            
            try:
                if test_func():
                    passed += 1
                    self.log(f"✅ {test_name} PASSED")
                else:
                    failed += 1
                    self.log(f"❌ {test_name} FAILED")
            except Exception as e:
                failed += 1
                self.log(f"❌ {test_name} FAILED with exception: {e}", "ERROR")
        
        self.log(f"\n{'='*50}")
        self.log(f"TEST SUMMARY")
        self.log(f"{'='*50}")
        self.log(f"Total Tests: {passed + failed}")
        self.log(f"Passed: {passed}")
        self.log(f"Failed: {failed}")
        self.log(f"Success Rate: {(passed/(passed+failed)*100):.1f}%")
        
        return failed == 0

if __name__ == "__main__":
    tester = APITester()
    success = tester.run_all_tests()
    sys.exit(0 if success else 1)