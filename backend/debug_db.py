from app.database import Base
from app import models
print("Tables in Base.metadata.tables:", list(Base.metadata.tables.keys()))
