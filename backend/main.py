import os
import shutil
from datetime import datetime, timedelta
from typing import Optional

from fastapi import FastAPI, HTTPException, Depends, File, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm

from sqlalchemy import create_engine, Column, Integer, String, Enum, TIMESTAMP, func, text
from sqlalchemy.orm import sessionmaker, Session, declarative_base
from pydantic import BaseModel

from passlib.context import CryptContext
from jose import JWTError, jwt

# =======================
# 🔐 安全配置 (JWT)
# =======================
SECRET_KEY = "LIXINGCHEN_IS_THE_BEST_DEVELOPER" # 密钥，实际项目中要保密
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30

# 密码加密工具
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
# 令牌提取工具
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

# =======================
# 🗄️ 数据库配置
# =======================
SQLALCHEMY_DATABASE_URL = "mysql+pymysql://root:52585258@localhost:3306/lixingchen" # 👈 记得确认你的密码！

UPLOAD_DIR = "uploads"
if not os.path.exists(UPLOAD_DIR):
    os.makedirs(UPLOAD_DIR)

engine = create_engine(SQLALCHEMY_DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# =======================
# 📝 数据库模型
# =======================
class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, nullable=False)
    email = Column(String(100), unique=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    role = Column(Enum('user', 'admin'), default='user') # 身份：user 或 admin
    created_at = Column(TIMESTAMP, server_default=func.now())

class Asset(Base):
    __tablename__ = "assets"
    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(150), nullable=False)
    file_path = Column(String(500), nullable=False)
    file_url = Column(String(500), nullable=False)
    type = Column(String(50), default="image")
    created_at = Column(TIMESTAMP, server_default=func.now())



Base.metadata.create_all(bind=engine)

app = FastAPI(title="数字资产平台 API")

# CORS 和静态文件
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # 允许所有来源，方便开发
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")

# =======================
# 🛠️ 工具函数
# =======================
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password):
    return pwd_context.hash(password)

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=15)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

# 👮‍♂️ 核心安保：检查当前登录用户
async def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="登录已过期或无效",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
    
    user = db.query(User).filter(User.username == username).first()
    if user is None:
        raise credentials_exception
    return user

# 👮‍♂️ 超级安保：只允许管理员通过
async def get_admin_user(current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="权限不足：只有管理员可以上传！")
    return current_user

# =======================
# 📡 接口区域
# =======================

# 1. 注册接口 (支持设置角色，仅供测试方便)
class UserCreate(BaseModel):
    username: str
    email: str
    password: str
    role: str = "user" # 默认是普通用户，你可以手动传 "admin"

@app.post("/users/", tags=["用户管理"])
def create_user(user: UserCreate, db: Session = Depends(get_db)):
    db_user = db.query(User).filter(User.username == user.username).first()
    if db_user:
        raise HTTPException(status_code=400, detail="用户名已存在")
    
    hashed_password = get_password_hash(user.password)
    new_user = User(
        username=user.username,
        email=user.email,
        password_hash=hashed_password,
        role=user.role 
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return {"username": new_user.username, "role": new_user.role}

# 2. 登录接口 (获取 Token)
@app.post("/token", tags=["用户管理"])
async def login_for_access_token(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == form_data.username).first()
    if not user or not verify_password(form_data.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="用户名或密码错误",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    access_token = create_access_token(data={"sub": user.username})
    return {"access_token": access_token, "token_type": "bearer", "role": user.role}

# 3. 上传接口 (🔒 已上锁：需要 Admin 权限)
@app.post("/upload/", tags=["资产管理"])
async def upload_file(
    file: UploadFile = File(...), 
    db: Session = Depends(get_db),
    current_user: User = Depends(get_admin_user) # 👈 这里加了锁！
):
    file_location = f"{UPLOAD_DIR}/{file.filename}"
    with open(file_location, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    
    file_url = f"http://localhost:8000/uploads/{file.filename}"
    new_asset = Asset(
        title=file.filename,
        file_path=file_location,
        file_url=file_url,
        type="image"
    )
    db.add(new_asset)
    db.commit()
    db.refresh(new_asset)
    return {"info": "上传成功", "url": file_url}

# 4. 获取列表 (🔓 开放：所有人可读)
@app.get("/assets/", tags=["资产管理"])
def read_assets(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    assets = db.query(Asset).order_by(Asset.created_at.desc()).offset(skip).limit(limit).all()
    return assets

@app.get("/")
def read_root():
    return {"status": "online", "message": "Python 后端已升级为安全模式"}