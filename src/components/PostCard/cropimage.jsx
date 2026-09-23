export default async function getEditedImage(imageSrc, crop, filter) {
  // imageSrc can be a real File/Blob object, OR an already-created URL
  // string (blob:, http(s):, data:).
  //
  // ← FIX: previously this only ever accepted a URL string and loaded it
  // directly. When that string was a blob: URL created much earlier by
  // an upstream picker screen, it could already be dead by the time this
  // runs (revoked by a cleanup effect on unmount, or the page reloaded)
  // — producing "net::ERR_FILE_NOT_FOUND" / "Image load failed" here,
  // with no indication of why. Passing the actual File/Blob object in
  // (see addimagepost.jsx's `files[i] || images[i]`) lets us mint a
  // FRESH object URL right here, used immediately and revoked right
  // after — so it no longer matters whether some earlier blob: URL is
  // still alive.
  const isFileLike = typeof Blob !== "undefined" && imageSrc instanceof Blob;
  const objectUrl = isFileLike ? URL.createObjectURL(imageSrc) : null;
  const src = objectUrl || imageSrc;

  try {
    const image = await new Promise((resolve, reject) => {
      const img = new Image();

      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Image load failed"));

      // ← Don't set crossOrigin for blob/object URLs — only needed for
      // cross-origin http(s) sources.
      if (!src.startsWith("blob:")) {
        img.crossOrigin = "anonymous";
      }

      img.src = src;
    });

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");

    // ← default crop to full image if not provided
    if (!crop || !crop.width || !crop.height) {
      crop = {
        x: 0,
        y: 0,
        width: image.naturalWidth,
        height: image.naturalHeight,
      };
    }

    canvas.width = crop.width;
    canvas.height = crop.height;

    if (filter) ctx.filter = filter;

    ctx.drawImage(
      image,
      crop.x, crop.y,
      crop.width, crop.height,
      0, 0,
      crop.width, crop.height
    );

    return await new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (blob) resolve(blob);
          else reject(new Error("Canvas toBlob failed"));
        },
        "image/jpeg",
        0.92
      );
    });
  } finally {
    // Only revoke the URL we minted ourselves — never touch a URL that
    // was handed to us, since the caller (or another screen) may still
    // need it for its own preview.
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }
}