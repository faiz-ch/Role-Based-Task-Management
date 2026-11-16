"""Profile photos: tidy every upload into one small, sharp square image.

- Turns phone photos the right way up (they often carry a "rotate me" note instead of being rotated).
- Cuts the middle square (photos are shown in circles anyway).
- Scales to 512 x 512: sharp on high-resolution screens, yet small (about 30-60 KB) so lists load fast.
- Saves as JPEG; a transparent background becomes white.
"""
from io import BytesIO

from PIL import Image, ImageOps, UnidentifiedImageError

AVATAR_SIZE = 512


class BadImage(ValueError):
    pass


def make_avatar(data: bytes) -> bytes:
    try:
        img = Image.open(BytesIO(data))
        img.load()
    except (UnidentifiedImageError, OSError) as exc:
        raise BadImage("The file is not a readable image.") from exc
    if img.width * img.height > 40_000_000:  # refuse absurdly large pictures (memory safety)
        raise BadImage("The image is too large.")
    img = ImageOps.exif_transpose(img)  # right way up
    if img.mode in ("RGBA", "LA", "P"):
        img = img.convert("RGBA")
        bg = Image.new("RGB", img.size, (255, 255, 255))
        bg.paste(img, mask=img.split()[-1])
        img = bg
    else:
        img = img.convert("RGB")
    side = min(img.width, img.height, AVATAR_SIZE)  # never enlarge a small photo
    img = ImageOps.fit(img, (side, side), method=Image.LANCZOS, centering=(0.5, 0.4))  # slightly above centre keeps faces
    out = BytesIO()
    img.save(out, "JPEG", quality=88, optimize=True, progressive=True)
    return out.getvalue()
