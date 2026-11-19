export function previewImage(file, imgEl) {
  clearImagePreview(imgEl);
  const url = URL.createObjectURL(file);
  imgEl.dataset.objectUrl = url;
  imgEl.src = url;
  return url;
}

export function clearImagePreview(imgEl) {
  if (imgEl.dataset.objectUrl) {
    URL.revokeObjectURL(imgEl.dataset.objectUrl);
    delete imgEl.dataset.objectUrl;
  }
  imgEl.removeAttribute("src");
  imgEl.classList.remove("show");
}
