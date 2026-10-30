'use strict';

// Pure, independently testable origin/permission gate. Do not grant camera,
// screen sharing, geolocation, downloads or notifications in the spike.
function sameAppOrigin(candidate, expectedOrigin) {
  try {
    const url = new URL(candidate);
    return url.protocol === 'http:' &&
      url.hostname === '127.0.0.1' &&
      url.origin === expectedOrigin &&
      url.username === '' && url.password === '';
  } catch { return false; }
}

function allowAudioOnly({ requestingUrl, expectedOrigin, permission, mediaTypes, mediaType }) {
  if (permission !== 'media' || !sameAppOrigin(requestingUrl, expectedOrigin)) return false;
  if (Array.isArray(mediaTypes)) {
    return mediaTypes.length > 0 && mediaTypes.every(type => type === 'audio');
  }
  // Permission-check callback provides mediaType rather than mediaTypes.
  return mediaType === 'audio';
}

module.exports = { sameAppOrigin, allowAudioOnly };
