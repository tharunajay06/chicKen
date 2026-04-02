from fastapi import FastAPI, APIRouter, HTTPException, Query
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, validator
from typing import List, Optional, Dict, Any
from datetime import datetime, timedelta
from bson import ObjectId
import re

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Create the main app
app = FastAPI(title="Meat Delivery API", version="2.0")

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Helper function to convert ObjectId to string
def serialize_doc(doc):
    if doc and '_id' in doc:
        doc['_id'] = str(doc['_id'])
    return doc

def serialize_list(docs):
    return [serialize_doc(doc) for doc in docs]

# ============== ENHANCED MODELS ==============

class Address(BaseModel):
    id: Optional[str] = None
    label: str  # Home, Work, Other
    fullAddress: str
    landmark: Optional[str] = None
    pincode: str
    isDefault: bool = False
    
    @validator('pincode')
    def validate_pincode(cls, v):
        if not re.match(r'^\d{6}$', v):
            raise ValueError('Invalid pincode format')
        return v

class User(BaseModel):
    phone: str
    name: Optional[str] = None
    email: Optional[str] = None
    addresses: List[Dict] = []
    savedAddresses: List[Address] = []
    recentSearches: List[str] = []
    createdAt: datetime = Field(default_factory=datetime.utcnow)
    lastLogin: Optional[datetime] = None

class Product(BaseModel):
    name: str
    category: str
    cutType: str
    pricePerKg: float
    imageBase64: Optional[str] = None
    description: Optional[str] = None
    available: bool = True
    stock: int = 100  # Available quantity in kg
    rating: float = 4.5
    reviewCount: int = 0
    tags: List[str] = []  # For search: ["boneless", "fresh", "chicken"]
    discount: float = 0  # Percentage discount
    
class CartItem(BaseModel):
    productId: str
    quantity: float
    price: float
    productName: str
    cutType: str
    pricePerKg: float

class Cart(BaseModel):
    userId: str
    items: List[CartItem] = []
    appliedCoupon: Optional[str] = None
    discount: float = 0
    updatedAt: datetime = Field(default_factory=datetime.utcnow)

class OrderItem(BaseModel):
    productId: str
    productName: str
    cutType: str
    quantity: float
    pricePerKg: float
    totalPrice: float

class Order(BaseModel):
    userId: str
    orderNumber: str
    items: List[OrderItem]
    totalAmount: float
    discount: float = 0
    finalAmount: float
    paymentMethod: str
    paymentStatus: str = "pending"  # pending, completed, failed
    orderStatus: str = "placed"  # placed, confirmed, packed, out_for_delivery, delivered, cancelled
    address: Dict
    deliveryTime: int = 20
    statusHistory: List[Dict] = []
    createdAt: datetime = Field(default_factory=datetime.utcnow)
    estimatedDelivery: Optional[datetime] = None

class Coupon(BaseModel):
    code: str
    discountType: str  # percentage, fixed
    discountValue: float
    minOrderValue: float = 0
    maxDiscount: Optional[float] = None
    validFrom: datetime
    validUntil: datetime
    usageLimit: int = 1000
    usedCount: int = 0
    active: bool = True

# ============== REQUEST MODELS ==============

class LoginRequest(BaseModel):
    phone: str
    otp: Optional[str] = None

class AddToCartRequest(BaseModel):
    userId: str
    productId: str
    quantity: float

class UpdateCartRequest(BaseModel):
    userId: str
    productId: str
    quantity: float

class RemoveFromCartRequest(BaseModel):
    userId: str
    productId: str

class ApplyCouponRequest(BaseModel):
    userId: str
    couponCode: str

class PlaceOrderRequest(BaseModel):
    userId: str
    addressId: str
    paymentMethod: str

class AddAddressRequest(BaseModel):
    userId: str
    address: Address

class UpdateOrderStatusRequest(BaseModel):
    orderId: str
    status: str
    comment: Optional[str] = None

class AddReviewRequest(BaseModel):
    productId: str
    userId: str
    rating: float
    comment: Optional[str] = None

# ============== AUTH ROUTES ==============

@api_router.post("/auth/login")
async def login(request: LoginRequest):
    """Enhanced login with last login tracking"""
    try:
        if request.otp and request.otp != "1234":
            raise HTTPException(status_code=400, detail="Invalid OTP")
        
        user = await db.users.find_one({"phone": request.phone})
        
        if not user:
            user_data = {
                "phone": request.phone,
                "name": f"User {request.phone[-4:]}",
                "email": None,
                "addresses": [],
                "savedAddresses": [],
                "recentSearches": [],
                "createdAt": datetime.utcnow(),
                "lastLogin": datetime.utcnow()
            }
            result = await db.users.insert_one(user_data)
            user_data['_id'] = str(result.inserted_id)
            return {
                "success": True,
                "user": user_data,
                "message": "User created successfully"
            }
        
        # Update last login
        await db.users.update_one(
            {"_id": user["_id"]},
            {"$set": {"lastLogin": datetime.utcnow()}}
        )
        
        user = serialize_doc(user)
        return {
            "success": True,
            "user": user,
            "message": "Login successful"
        }
    except Exception as e:
        logger.error(f"Login error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# ============== SEARCH API (NEW) ==============

@api_router.get("/search")
async def search_products(
    q: str = Query(..., min_length=1),
    userId: Optional[str] = None
):
    """
    Search products by name, category, tags, description
    """
    try:
        # Create search regex (case-insensitive)
        search_pattern = re.compile(re.escape(q), re.IGNORECASE)
        
        # Search in multiple fields
        products = await db.products.find({
            "$and": [
                {"available": True},
                {
                    "$or": [
                        {"name": {"$regex": search_pattern}},
                        {"category": {"$regex": search_pattern}},
                        {"cutType": {"$regex": search_pattern}},
                        {"description": {"$regex": search_pattern}},
                        {"tags": {"$regex": search_pattern}}
                    ]
                }
            ]
        }).to_list(50)
        
        # Save to recent searches
        if userId:
            await db.users.update_one(
                {"_id": ObjectId(userId)},
                {
                    "$push": {
                        "recentSearches": {
                            "$each": [q],
                            "$slice": -10  # Keep only last 10 searches
                        }
                    }
                }
            )
        
        return {
            "success": True,
            "query": q,
            "count": len(products),
            "results": serialize_list(products)
        }
    except Exception as e:
        logger.error(f"Search error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.get("/search/suggestions")
async def get_search_suggestions(q: str = Query(..., min_length=1)):
    """Get search suggestions based on partial query"""
    try:
        search_pattern = re.compile(f"^{re.escape(q)}", re.IGNORECASE)
        
        # Get unique product names and categories
        pipeline = [
            {
                "$match": {
                    "available": True,
                    "$or": [
                        {"name": {"$regex": search_pattern}},
                        {"category": {"$regex": search_pattern}},
                        {"cutType": {"$regex": search_pattern}}
                    ]
                }
            },
            {
                "$group": {
                    "_id": None,
                    "names": {"$addToSet": "$name"},
                    "categories": {"$addToSet": "$category"},
                    "cutTypes": {"$addToSet": "$cutType"}
                }
            }
        ]
        
        result = await db.products.aggregate(pipeline).to_list(1)
        
        if result:
            suggestions = list(set(
                result[0].get("names", []) +
                result[0].get("categories", []) +
                result[0].get("cutTypes", [])
            ))[:10]
        else:
            suggestions = []
        
        return {"suggestions": suggestions}
    except Exception as e:
        logger.error(f"Suggestions error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.get("/search/recent/{userId}")
async def get_recent_searches(userId: str):
    """Get user's recent searches"""
    try:
        user = await db.users.find_one({"_id": ObjectId(userId)})
        if not user:
            return {"recentSearches": []}
        
        return {"recentSearches": user.get("recentSearches", [])[::-1]}  # Reverse to show latest first
    except Exception as e:
        logger.error(f"Recent searches error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.delete("/search/recent/{userId}")
async def clear_recent_searches(userId: str):
    """Clear user's recent searches"""
    try:
        await db.users.update_one(
            {"_id": ObjectId(userId)},
            {"$set": {"recentSearches": []}}
        )
        return {"success": True, "message": "Recent searches cleared"}
    except Exception as e:
        logger.error(f"Clear searches error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# ============== PRODUCT ROUTES (ENHANCED) ==============

@api_router.get("/products")
async def get_products(
    category: Optional[str] = None,
    inStock: bool = True,
    sortBy: Optional[str] = "name"  # name, price, rating
):
    """Get all products with filters"""
    try:
        query = {"available": True}
        if category:
            query["category"] = category
        if inStock:
            query["stock"] = {"$gt": 0}
        
        # Sort options
        sort_field = "name"
        if sortBy == "price":
            sort_field = "pricePerKg"
        elif sortBy == "rating":
            sort_field = "rating"
        
        products = await db.products.find(query).sort(sort_field, 1).to_list(1000)
        return serialize_list(products)
    except Exception as e:
        logger.error(f"Get products error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.get("/products/category/{category}")
async def get_products_by_category(category: str):
    """Get products by category"""
    try:
        products = await db.products.find({
            "category": category,
            "available": True
        }).to_list(1000)
        return serialize_list(products)
    except Exception as e:
        logger.error(f"Get products by category error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.get("/products/{productId}")
async def get_product_detail(productId: str):
    """Get single product details"""
    try:
        product = await db.products.find_one({"_id": ObjectId(productId)})
        if not product:
            raise HTTPException(status_code=404, detail="Product not found")
        return serialize_doc(product)
    except Exception as e:
        logger.error(f"Get product detail error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.get("/categories")
async def get_categories():
    """Get all categories"""
    try:
        pipeline = [
            {"$match": {"available": True}},
            {"$group": {
                "_id": "$category",
                "minPrice": {"$min": "$pricePerKg"},
                "productCount": {"$sum": 1},
                "imageBase64": {"$first": "$imageBase64"}
            }}
        ]
        categories = await db.products.aggregate(pipeline).to_list(100)
        return [
            {
                "name": cat["_id"],
                "price": cat["minPrice"],
                "productCount": cat["productCount"],
                "imageBase64": cat.get("imageBase64")
            }
            for cat in categories
        ]
    except Exception as e:
        logger.error(f"Get categories error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# ============== CART ROUTES (ENHANCED) ==============

@api_router.post("/cart/add")
async def add_to_cart(request: AddToCartRequest):
    """Add item to cart with stock validation"""
    try:
        product = await db.products.find_one({"_id": ObjectId(request.productId)})
        if not product:
            raise HTTPException(status_code=404, detail="Product not found")
        
        if not product.get("available", True):
            raise HTTPException(status_code=400, detail="Product not available")
        
        if product.get("stock", 0) < request.quantity:
            raise HTTPException(status_code=400, detail="Insufficient stock")
        
        cart = await db.carts.find_one({"userId": request.userId})
        
        cart_item = {
            "productId": request.productId,
            "quantity": request.quantity,
            "price": product["pricePerKg"] * request.quantity,
            "productName": product["name"],
            "cutType": product["cutType"],
            "pricePerKg": product["pricePerKg"]
        }
        
        if cart:
            item_exists = False
            for i, item in enumerate(cart["items"]):
                if item["productId"] == request.productId:
                    new_quantity = item["quantity"] + request.quantity
                    if product.get("stock", 0) < new_quantity:
                        raise HTTPException(status_code=400, detail="Insufficient stock")
                    cart["items"][i]["quantity"] = new_quantity
                    cart["items"][i]["price"] = new_quantity * product["pricePerKg"]
                    item_exists = True
                    break
            
            if not item_exists:
                cart["items"].append(cart_item)
            
            cart["updatedAt"] = datetime.utcnow()
            await db.carts.update_one(
                {"userId": request.userId},
                {"$set": cart}
            )
        else:
            cart = {
                "userId": request.userId,
                "items": [cart_item],
                "appliedCoupon": None,
                "discount": 0,
                "updatedAt": datetime.utcnow()
            }
            await db.carts.insert_one(cart)
        
        return {"success": True, "message": "Item added to cart"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Add to cart error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.get("/cart/{userId}")
async def get_cart(userId: str):
    """Get user cart"""
    try:
        cart = await db.carts.find_one({"userId": userId})
        if not cart:
            return {"userId": userId, "items": [], "total": 0, "discount": 0, "finalTotal": 0}
        
        cart = serialize_doc(cart)
        total = sum(item["price"] for item in cart["items"])
        discount = cart.get("discount", 0)
        finalTotal = total - discount
        
        cart["total"] = total
        cart["finalTotal"] = max(0, finalTotal)
        return cart
    except Exception as e:
        logger.error(f"Get cart error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.put("/cart/update")
async def update_cart(request: UpdateCartRequest):
    """Update cart item quantity"""
    try:
        cart = await db.carts.find_one({"userId": request.userId})
        if not cart:
            raise HTTPException(status_code=404, detail="Cart not found")
        
        product = await db.products.find_one({"_id": ObjectId(request.productId)})
        if not product:
            raise HTTPException(status_code=404, detail="Product not found")
        
        if product.get("stock", 0) < request.quantity:
            raise HTTPException(status_code=400, detail="Insufficient stock")
        
        for i, item in enumerate(cart["items"]):
            if item["productId"] == request.productId:
                cart["items"][i]["quantity"] = request.quantity
                cart["items"][i]["price"] = request.quantity * product["pricePerKg"]
                break
        
        cart["updatedAt"] = datetime.utcnow()
        await db.carts.update_one(
            {"userId": request.userId},
            {"$set": cart}
        )
        
        return {"success": True, "message": "Cart updated"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Update cart error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.delete("/cart/remove")
async def remove_from_cart(request: RemoveFromCartRequest):
    """Remove item from cart"""
    try:
        cart = await db.carts.find_one({"userId": request.userId})
        if not cart:
            raise HTTPException(status_code=404, detail="Cart not found")
        
        cart["items"] = [item for item in cart["items"] if item["productId"] != request.productId]
        cart["updatedAt"] = datetime.utcnow()
        
        await db.carts.update_one(
            {"userId": request.userId},
            {"$set": cart}
        )
        
        return {"success": True, "message": "Item removed from cart"}
    except Exception as e:
        logger.error(f"Remove from cart error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# ============== COUPON SYSTEM (NEW) ==============

@api_router.post("/cart/apply-coupon")
async def apply_coupon(request: ApplyCouponRequest):
    """Apply coupon code to cart"""
    try:
        cart = await db.carts.find_one({"userId": request.userId})
        if not cart or not cart.get("items"):
            raise HTTPException(status_code=400, detail="Cart is empty")
        
        coupon = await db.coupons.find_one({
            "code": request.couponCode.upper(),
            "active": True
        })
        
        if not coupon:
            raise HTTPException(status_code=404, detail="Invalid coupon code")
        
        now = datetime.utcnow()
        if now < coupon["validFrom"] or now > coupon["validUntil"]:
            raise HTTPException(status_code=400, detail="Coupon expired")
        
        if coupon["usedCount"] >= coupon["usageLimit"]:
            raise HTTPException(status_code=400, detail="Coupon usage limit reached")
        
        cart_total = sum(item["price"] for item in cart["items"])
        
        if cart_total < coupon["minOrderValue"]:
            raise HTTPException(
                status_code=400,
                detail=f"Minimum order value ₹{coupon['minOrderValue']} required"
            )
        
        # Calculate discount
        if coupon["discountType"] == "percentage":
            discount = (cart_total * coupon["discountValue"]) / 100
            if coupon.get("maxDiscount"):
                discount = min(discount, coupon["maxDiscount"])
        else:  # fixed
            discount = coupon["discountValue"]
        
        discount = min(discount, cart_total)  # Can't exceed cart total
        
        # Update cart
        await db.carts.update_one(
            {"userId": request.userId},
            {
                "$set": {
                    "appliedCoupon": request.couponCode.upper(),
                    "discount": discount,
                    "updatedAt": datetime.utcnow()
                }
            }
        )
        
        return {
            "success": True,
            "message": "Coupon applied successfully",
            "discount": discount,
            "finalAmount": cart_total - discount
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Apply coupon error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.delete("/cart/remove-coupon/{userId}")
async def remove_coupon(userId: str):
    """Remove applied coupon"""
    try:
        await db.carts.update_one(
            {"userId": userId},
            {
                "$set": {
                    "appliedCoupon": None,
                    "discount": 0,
                    "updatedAt": datetime.utcnow()
                }
            }
        )
        return {"success": True, "message": "Coupon removed"}
    except Exception as e:
        logger.error(f"Remove coupon error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.get("/coupons/available")
async def get_available_coupons():
    """Get all available coupons"""
    try:
        now = datetime.utcnow()
        coupons = await db.coupons.find({
            "active": True,
            "validFrom": {"$lte": now},
            "validUntil": {"$gte": now}
        }).to_list(100)
        return serialize_list(coupons)
    except Exception as e:
        logger.error(f"Get coupons error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# ============== ADDRESS MANAGEMENT (NEW) ==============

@api_router.post("/addresses/add")
async def add_address(request: AddAddressRequest):
    """Add new address"""
    try:
        user = await db.users.find_one({"_id": ObjectId(request.userId)})
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        
        address = request.address.dict()
        address["id"] = str(ObjectId())
        address["createdAt"] = datetime.utcnow()
        
        # If this is set as default, unset others
        if address.get("isDefault"):
            await db.users.update_one(
                {"_id": ObjectId(request.userId)},
                {"$set": {"savedAddresses.$[].isDefault": False}}
            )
        
        await db.users.update_one(
            {"_id": ObjectId(request.userId)},
            {"$push": {"savedAddresses": address}}
        )
        
        return {"success": True, "message": "Address added", "addressId": address["id"]}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Add address error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.get("/addresses/{userId}")
async def get_addresses(userId: str):
    """Get all user addresses"""
    try:
        user = await db.users.find_one({"_id": ObjectId(userId)})
        if not user:
            return {"addresses": []}
        
        return {"addresses": user.get("savedAddresses", [])}
    except Exception as e:
        logger.error(f"Get addresses error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.put("/addresses/update/{userId}/{addressId}")
async def update_address(userId: str, addressId: str, address: Address):
    """Update existing address"""
    try:
        user = await db.users.find_one({"_id": ObjectId(userId)})
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        
        addresses = user.get("savedAddresses", [])
        updated = False
        
        for i, addr in enumerate(addresses):
            if addr.get("id") == addressId:
                address_dict = address.dict()
                address_dict["id"] = addressId
                addresses[i] = address_dict
                updated = True
                break
        
        if not updated:
            raise HTTPException(status_code=404, detail="Address not found")
        
        # If setting as default, unset others
        if address.isDefault:
            for addr in addresses:
                if addr.get("id") != addressId:
                    addr["isDefault"] = False
        
        await db.users.update_one(
            {"_id": ObjectId(userId)},
            {"$set": {"savedAddresses": addresses}}
        )
        
        return {"success": True, "message": "Address updated"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Update address error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.delete("/addresses/delete/{userId}/{addressId}")
async def delete_address(userId: str, addressId: str):
    """Delete address"""
    try:
        await db.users.update_one(
            {"_id": ObjectId(userId)},
            {"$pull": {"savedAddresses": {"id": addressId}}}
        )
        return {"success": True, "message": "Address deleted"}
    except Exception as e:
        logger.error(f"Delete address error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# ============== ORDER ROUTES (ENHANCED) ==============

@api_router.post("/orders")
async def place_order(request: PlaceOrderRequest):
    """Place order with enhanced tracking"""
    try:
        cart = await db.carts.find_one({"userId": request.userId})
        if not cart or not cart["items"]:
            raise HTTPException(status_code=400, detail="Cart is empty")
        
        # Get address details
        user = await db.users.find_one({"_id": ObjectId(request.userId)})
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        
        address = None
        for addr in user.get("savedAddresses", []):
            if addr.get("id") == request.addressId:
                address = addr
                break
        
        if not address:
            raise HTTPException(status_code=404, detail="Address not found")
        
        # Create order items and update stock
        order_items = []
        total_amount = 0
        
        for item in cart["items"]:
            product = await db.products.find_one({"_id": ObjectId(item["productId"])})
            if product:
                # Check stock
                if product.get("stock", 0) < item["quantity"]:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Insufficient stock for {product['name']}"
                    )
                
                order_item = {
                    "productId": item["productId"],
                    "productName": product["name"],
                    "cutType": product["cutType"],
                    "quantity": item["quantity"],
                    "pricePerKg": product["pricePerKg"],
                    "totalPrice": item["price"]
                }
                order_items.append(order_item)
                total_amount += item["price"]
                
                # Update stock
                await db.products.update_one(
                    {"_id": ObjectId(item["productId"])},
                    {"$inc": {"stock": -item["quantity"]}}
                )
        
        # Generate order number
        order_count = await db.orders.count_documents({})
        order_number = f"ORD{datetime.utcnow().strftime('%Y%m%d')}{order_count + 1:04d}"
        
        # Calculate final amount with discount
        discount = cart.get("discount", 0)
        final_amount = total_amount - discount
        
        # Create order
        order = {
            "userId": request.userId,
            "orderNumber": order_number,
            "items": order_items,
            "totalAmount": total_amount,
            "discount": discount,
            "finalAmount": final_amount,
            "paymentMethod": request.paymentMethod,
            "paymentStatus": "completed" if request.paymentMethod == "COD" else "pending",
            "orderStatus": "placed",
            "address": address,
            "deliveryTime": 20,
            "statusHistory": [{
                "status": "placed",
                "timestamp": datetime.utcnow(),
                "comment": "Order placed successfully"
            }],
            "createdAt": datetime.utcnow(),
            "estimatedDelivery": datetime.utcnow() + timedelta(minutes=20)
        }
        
        result = await db.orders.insert_one(order)
        order["_id"] = str(result.inserted_id)
        
        # Clear cart
        await db.carts.update_one(
            {"userId": request.userId},
            {
                "$set": {
                    "items": [],
                    "appliedCoupon": None,
                    "discount": 0,
                    "updatedAt": datetime.utcnow()
                }
            }
        )
        
        # Update coupon usage if applied
        if cart.get("appliedCoupon"):
            await db.coupons.update_one(
                {"code": cart["appliedCoupon"]},
                {"$inc": {"usedCount": 1}}
            )
        
        return {
            "success": True,
            "orderId": str(result.inserted_id),
            "orderNumber": order_number,
            "message": "Order placed successfully",
            "deliveryTime": 20
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Place order error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.get("/orders/user/{userId}")
async def get_user_orders(userId: str):
    """Get all orders for a user"""
    try:
        orders = await db.orders.find({"userId": userId}).sort("createdAt", -1).to_list(1000)
        return serialize_list(orders)
    except Exception as e:
        logger.error(f"Get user orders error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.get("/orders/{orderId}")
async def get_order(orderId: str):
    """Get order details"""
    try:
        order = await db.orders.find_one({"_id": ObjectId(orderId)})
        if not order:
            raise HTTPException(status_code=404, detail="Order not found")
        return serialize_doc(order)
    except Exception as e:
        logger.error(f"Get order error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.put("/orders/update-status")
async def update_order_status(request: UpdateOrderStatusRequest):
    """Update order status (for admin/delivery tracking)"""
    try:
        order = await db.orders.find_one({"_id": ObjectId(request.orderId)})
        if not order:
            raise HTTPException(status_code=404, detail="Order not found")
        
        # Add to status history
        status_update = {
            "status": request.status,
            "timestamp": datetime.utcnow(),
            "comment": request.comment or f"Order {request.status}"
        }
        
        await db.orders.update_one(
            {"_id": ObjectId(request.orderId)},
            {
                "$set": {"orderStatus": request.status},
                "$push": {"statusHistory": status_update}
            }
        )
        
        return {"success": True, "message": "Order status updated"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Update order status error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# ============== REVIEWS & RATINGS (NEW) ==============

@api_router.post("/products/review")
async def add_review(request: AddReviewRequest):
    """Add product review"""
    try:
        product = await db.products.find_one({"_id": ObjectId(request.productId)})
        if not product:
            raise HTTPException(status_code=404, detail="Product not found")
        
        review = {
            "userId": request.userId,
            "productId": request.productId,
            "rating": request.rating,
            "comment": request.comment,
            "createdAt": datetime.utcnow()
        }
        
        await db.reviews.insert_one(review)
        
        # Update product rating
        all_reviews = await db.reviews.find({"productId": request.productId}).to_list(1000)
        avg_rating = sum(r["rating"] for r in all_reviews) / len(all_reviews)
        
        await db.products.update_one(
            {"_id": ObjectId(request.productId)},
            {
                "$set": {
                    "rating": round(avg_rating, 1),
                    "reviewCount": len(all_reviews)
                }
            }
        )
        
        return {"success": True, "message": "Review added"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Add review error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.get("/products/{productId}/reviews")
async def get_product_reviews(productId: str):
    """Get all reviews for a product"""
    try:
        reviews = await db.reviews.find({"productId": productId}).sort("createdAt", -1).to_list(100)
        return serialize_list(reviews)
    except Exception as e:
        logger.error(f"Get reviews error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# ============== SEED DATA (ENHANCED) ==============

@api_router.post("/seed")
async def seed_data():
    """Seed database with enhanced products and coupons"""
    try:
        # Check if products already exist
        count = await db.products.count_documents({})
        if count > 0:
            return {"message": "Database already seeded", "count": count}
        
        products = [
            # Broiler Chicken
            {
                "name": "Broiler Chicken",
                "category": "Broiler Chicken",
                "cutType": "Curry Cut",
                "pricePerKg": 240,
                "description": "Fresh broiler chicken curry cut with bone",
                "available": True,
                "stock": 50,
                "rating": 4.5,
                "reviewCount": 128,
                "tags": ["chicken", "curry cut", "bone-in", "fresh"],
                "discount": 0,
                "imageBase64": None
            },
            {
                "name": "Broiler Chicken",
                "category": "Broiler Chicken",
                "cutType": "Boneless",
                "pricePerKg": 280,
                "description": "Premium boneless broiler chicken breast",
                "available": True,
                "stock": 40,
                "rating": 4.7,
                "reviewCount": 95,
                "tags": ["chicken", "boneless", "breast", "premium"],
                "discount": 10,
                "imageBase64": None
            },
            {
                "name": "Broiler Chicken",
                "category": "Broiler Chicken",
                "cutType": "Boneless & Mince",
                "pricePerKg": 290,
                "description": "Fresh boneless chicken mince for kebabs",
                "available": True,
                "stock": 30,
                "rating": 4.6,
                "reviewCount": 67,
                "tags": ["chicken", "boneless", "mince", "kebab"],
                "discount": 0,
                "imageBase64": None
            },
            # Naatu Kozhi
            {
                "name": "Naatu Kozhi",
                "category": "Naatu Kozhi",
                "cutType": "Curry Cut",
                "pricePerKg": 450,
                "description": "Organic country chicken curry cut",
                "available": True,
                "stock": 20,
                "rating": 4.8,
                "reviewCount": 156,
                "tags": ["country chicken", "naatu kozhi", "organic", "curry cut"],
                "discount": 0,
                "imageBase64": None
            },
            {
                "name": "Naatu Kozhi",
                "category": "Naatu Kozhi",
                "cutType": "Bone-in",
                "pricePerKg": 440,
                "description": "Country chicken with bones for soup",
                "available": True,
                "stock": 15,
                "rating": 4.7,
                "reviewCount": 89,
                "tags": ["country chicken", "bone-in", "soup", "healthy"],
                "discount": 5,
                "imageBase64": None
            },
            # Kaadai
            {
                "name": "Kaadai",
                "category": "Kaadai",
                "cutType": "Curry Cut",
                "pricePerKg": 380,
                "description": "Fresh quail curry cut pieces",
                "available": True,
                "stock": 25,
                "rating": 4.4,
                "reviewCount": 45,
                "tags": ["quail", "kaadai", "curry cut"],
                "discount": 0,
                "imageBase64": None
            },
            {
                "name": "Kaadai",
                "category": "Kaadai",
                "cutType": "Whole",
                "pricePerKg": 370,
                "description": "Whole quail for roasting",
                "available": True,
                "stock": 18,
                "rating": 4.3,
                "reviewCount": 32,
                "tags": ["quail", "whole", "roast"],
                "discount": 0,
                "imageBase64": None
            },
            # Eggs
            {
                "name": "Eggs",
                "category": "Eggs",
                "cutType": "Tray",
                "pricePerKg": 170,
                "description": "Farm fresh eggs (30 pieces per tray)",
                "available": True,
                "stock": 100,
                "rating": 4.6,
                "reviewCount": 234,
                "tags": ["eggs", "fresh", "farm", "tray"],
                "discount": 0,
                "imageBase64": None
            }
        ]
        
        result = await db.products.insert_many(products)
        
        # Seed coupons
        coupons = [
            {
                "code": "WELCOME50",
                "discountType": "fixed",
                "discountValue": 50,
                "minOrderValue": 300,
                "maxDiscount": None,
                "validFrom": datetime.utcnow(),
                "validUntil": datetime.utcnow() + timedelta(days=30),
                "usageLimit": 1000,
                "usedCount": 0,
                "active": True
            },
            {
                "code": "SAVE10",
                "discountType": "percentage",
                "discountValue": 10,
                "minOrderValue": 500,
                "maxDiscount": 100,
                "validFrom": datetime.utcnow(),
                "validUntil": datetime.utcnow() + timedelta(days=30),
                "usageLimit": 500,
                "usedCount": 0,
                "active": True
            }
        ]
        
        await db.coupons.insert_many(coupons)
        
        return {
            "message": "Database seeded successfully",
            "products": len(result.inserted_ids),
            "coupons": len(coupons)
        }
    except Exception as e:
        logger.error(f"Seed data error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# Include router
app.include_router(api_router)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()

@app.get("/")
async def root():
    return {
        "app": "Meat Delivery API",
        "version": "2.0",
        "status": "running"
    }
