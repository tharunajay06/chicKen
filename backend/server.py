from fastapi import FastAPI, APIRouter, HTTPException
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime
from bson import ObjectId

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Create the main app without a prefix
app = FastAPI()

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

# ============== Models ==============

class User(BaseModel):
    phone: str
    name: Optional[str] = None
    addresses: List[str] = []
    createdAt: datetime = Field(default_factory=datetime.utcnow)

class Product(BaseModel):
    name: str
    category: str  # Broiler Chicken, Naatu Kozhi, Kaadai, Eggs
    cutType: str  # Curry Cut, Bone-in, Boneless, Boneless & Mince, Whole
    pricePerKg: float
    imageBase64: Optional[str] = None
    description: Optional[str] = None
    available: bool = True

class CartItem(BaseModel):
    productId: str
    quantity: float  # in kg
    price: float
    productName: str
    cutType: str

class Cart(BaseModel):
    userId: str
    items: List[CartItem] = []
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
    items: List[OrderItem]
    totalAmount: float
    paymentMethod: str  # COD or Online
    orderStatus: str = "placed"  # placed, confirmed, out_for_delivery, delivered
    address: str
    deliveryTime: int = 20  # minutes
    createdAt: datetime = Field(default_factory=datetime.utcnow)

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

class PlaceOrderRequest(BaseModel):
    userId: str
    address: str
    paymentMethod: str

# ============== Auth Routes ==============

@api_router.post("/auth/login")
async def login(request: LoginRequest):
    """Mock login - accepts any phone number and OTP 1234"""
    try:
        if request.otp and request.otp != "1234":
            raise HTTPException(status_code=400, detail="Invalid OTP")
        
        # Check if user exists
        user = await db.users.find_one({"phone": request.phone})
        
        if not user:
            # Create new user
            user_data = {
                "phone": request.phone,
                "name": f"User {request.phone[-4:]}",
                "addresses": [],
                "createdAt": datetime.utcnow()
            }
            result = await db.users.insert_one(user_data)
            user_data['_id'] = str(result.inserted_id)
            return {
                "success": True,
                "user": user_data,
                "message": "User created successfully"
            }
        
        user = serialize_doc(user)
        return {
            "success": True,
            "user": user,
            "message": "Login successful"
        }
    except Exception as e:
        logger.error(f"Login error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# ============== Product Routes ==============

@api_router.get("/products")
async def get_products():
    """Get all products"""
    try:
        products = await db.products.find({"available": True}).to_list(1000)
        return [serialize_doc(p) for p in products]
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
        return [serialize_doc(p) for p in products]
    except Exception as e:
        logger.error(f"Get products by category error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.get("/categories")
async def get_categories():
    """Get all unique categories with their prices"""
    try:
        pipeline = [
            {"$match": {"available": True}},
            {"$group": {
                "_id": "$category",
                "minPrice": {"$min": "$pricePerKg"},
                "imageBase64": {"$first": "$imageBase64"}
            }}
        ]
        categories = await db.products.aggregate(pipeline).to_list(100)
        return [
            {
                "name": cat["_id"],
                "price": cat["minPrice"],
                "imageBase64": cat.get("imageBase64")
            }
            for cat in categories
        ]
    except Exception as e:
        logger.error(f"Get categories error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# ============== Cart Routes ==============

@api_router.post("/cart/add")
async def add_to_cart(request: AddToCartRequest):
    """Add item to cart"""
    try:
        # Get product details
        product = await db.products.find_one({"_id": ObjectId(request.productId)})
        if not product:
            raise HTTPException(status_code=404, detail="Product not found")
        
        # Get or create cart
        cart = await db.carts.find_one({"userId": request.userId})
        
        cart_item = {
            "productId": request.productId,
            "quantity": request.quantity,
            "price": product["pricePerKg"] * request.quantity,
            "productName": product["name"],
            "cutType": product["cutType"]
        }
        
        if cart:
            # Check if item already exists
            item_exists = False
            for i, item in enumerate(cart["items"]):
                if item["productId"] == request.productId:
                    cart["items"][i]["quantity"] += request.quantity
                    cart["items"][i]["price"] = cart["items"][i]["quantity"] * product["pricePerKg"]
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
            # Create new cart
            cart = {
                "userId": request.userId,
                "items": [cart_item],
                "updatedAt": datetime.utcnow()
            }
            await db.carts.insert_one(cart)
        
        return {"success": True, "message": "Item added to cart"}
    except Exception as e:
        logger.error(f"Add to cart error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.get("/cart/{userId}")
async def get_cart(userId: str):
    """Get user cart"""
    try:
        cart = await db.carts.find_one({"userId": userId})
        if not cart:
            return {"userId": userId, "items": [], "total": 0}
        
        cart = serialize_doc(cart)
        total = sum(item["price"] for item in cart["items"])
        cart["total"] = total
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

# ============== Order Routes ==============

@api_router.post("/orders")
async def place_order(request: PlaceOrderRequest):
    """Place an order"""
    try:
        # Get cart
        cart = await db.carts.find_one({"userId": request.userId})
        if not cart or not cart["items"]:
            raise HTTPException(status_code=400, detail="Cart is empty")
        
        # Create order items
        order_items = []
        total_amount = 0
        
        for item in cart["items"]:
            product = await db.products.find_one({"_id": ObjectId(item["productId"])})
            if product:
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
        
        # Create order
        order = {
            "userId": request.userId,
            "items": order_items,
            "totalAmount": total_amount,
            "paymentMethod": request.paymentMethod,
            "orderStatus": "placed",
            "address": request.address,
            "deliveryTime": 20,
            "createdAt": datetime.utcnow()
        }
        
        result = await db.orders.insert_one(order)
        order["_id"] = str(result.inserted_id)
        
        # Clear cart
        await db.carts.update_one(
            {"userId": request.userId},
            {"$set": {"items": [], "updatedAt": datetime.utcnow()}}
        )
        
        return {
            "success": True,
            "orderId": str(result.inserted_id),
            "message": "Order placed successfully",
            "deliveryTime": 20
        }
    except Exception as e:
        logger.error(f"Place order error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.get("/orders/user/{userId}")
async def get_user_orders(userId: str):
    """Get all orders for a user"""
    try:
        orders = await db.orders.find({"userId": userId}).sort("createdAt", -1).to_list(1000)
        return [serialize_doc(order) for order in orders]
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

# ============== Seed Data Route ==============

@api_router.post("/seed")
async def seed_data():
    """Seed database with initial products"""
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
                "description": "Fresh broiler chicken curry cut",
                "available": True,
                "imageBase64": None
            },
            {
                "name": "Broiler Chicken",
                "category": "Broiler Chicken",
                "cutType": "Boneless",
                "pricePerKg": 280,
                "description": "Fresh boneless broiler chicken",
                "available": True,
                "imageBase64": None
            },
            {
                "name": "Broiler Chicken",
                "category": "Broiler Chicken",
                "cutType": "Boneless & Mince",
                "pricePerKg": 290,
                "description": "Fresh boneless and minced chicken",
                "available": True,
                "imageBase64": None
            },
            # Naatu Kozhi
            {
                "name": "Naatu Kozhi",
                "category": "Naatu Kozhi",
                "cutType": "Curry Cut",
                "pricePerKg": 450,
                "description": "Country chicken curry cut",
                "available": True,
                "imageBase64": None
            },
            {
                "name": "Naatu Kozhi",
                "category": "Naatu Kozhi",
                "cutType": "Bone-in",
                "pricePerKg": 440,
                "description": "Country chicken with bones",
                "available": True,
                "imageBase64": None
            },
            # Kaadai
            {
                "name": "Kaadai",
                "category": "Kaadai",
                "cutType": "Curry Cut",
                "pricePerKg": 380,
                "description": "Fresh quail curry cut",
                "available": True,
                "imageBase64": None
            },
            {
                "name": "Kaadai",
                "category": "Kaadai",
                "cutType": "Whole",
                "pricePerKg": 370,
                "description": "Whole quail",
                "available": True,
                "imageBase64": None
            },
            # Eggs
            {
                "name": "Eggs",
                "category": "Eggs",
                "cutType": "Tray",
                "pricePerKg": 170,
                "description": "Fresh eggs (30 pieces per tray)",
                "available": True,
                "imageBase64": None
            }
        ]
        
        result = await db.products.insert_many(products)
        return {
            "message": "Database seeded successfully",
            "count": len(result.inserted_ids)
        }
    except Exception as e:
        logger.error(f"Seed data error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# Include the router in the main app
app.include_router(api_router)

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
