from pydantic import BaseModel, EmailStr, field_validator


class RegisterRequest(BaseModel):
    name: str
    email: EmailStr
    password: str


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class RefreshRequest(BaseModel):
    refresh_token: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    email: EmailStr
    code: str
    new_password: str

    @field_validator("code")
    @classmethod
    def six_digits(cls, v: str) -> str:
        v = (v or "").strip().replace(" ", "")
        if not (len(v) == 6 and v.isdigit()):
            raise ValueError("The code has 6 digits")
        return v

    @field_validator("new_password")
    @classmethod
    def strong_enough(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("New password must be at least 8 characters")
        if len(v) > 128:
            raise ValueError("New password is too long (128 characters at most)")
        return v
