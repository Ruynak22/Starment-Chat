export function previewImage(file, imgEl) {
  const url = URL.createObjectURL(file);
  imgEl.src = url;
  return url;
}
