export const withDownload = (url, name) => {
  if (!url) return url;
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}download=${encodeURIComponent(name)}`;
};