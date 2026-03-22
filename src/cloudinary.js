const CLOUD_NAME = 'du34xyidb';
const UPLOAD_PRESET = 'quicky';

export async function uploadImage(file) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('upload_preset', UPLOAD_PRESET);

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`,
    { method: 'POST', body: formData }
  );
  const data = await response.json();
  if (data.secure_url) return data.secure_url;
  throw new Error(data.error?.message || 'Upload failed');
}