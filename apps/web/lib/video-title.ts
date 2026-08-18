/**
 * Turns a release filename into something a person would read out loud.
 * "The.Matrix.1999.1080p.BluRay.x264-GROUP.mkv" is the name a library shows
 * today; "The Matrix (1999)" is the name the film has.
 */

// Everything from the first of these onward is machine detail, not the title.
const NOISE = new RegExp(
  [
    "\\d{3,4}p", "\\d{3,4}i", "4k", "uhd", "hdr", "sdr", "hq",
    "bluray", "blu-ray", "brrip", "bdrip", "bdremux", "remux", "webrip", "web-dl", "webdl", "web",
    "hdtv", "dvdrip", "dvdscr", "hdrip", "camrip", "hdcam", "cam", "telesync", "ts", "tc",
    "x264", "x265", "h264", "h265", "hevc", "avc", "xvid", "divx", "av1", "10bit", "8bit",
    "aac\\d*", "ac3", "eac3", "dts(-hd)?", "dd\\+?\\d*", "ddp\\d*", "truehd", "atmos", "mp3", "flac", "opus",
    "yify", "yts(\\.\\w+)?", "rarbg", "ettv", "eztv", "fgt", "galaxytv", "psa",
    "netflix", "nf", "amzn", "dsnp", "hmax", "hulu",
    "multi", "dual", "dubbed", "subbed", "hardsub", "softsub"
  ].join("|"),
  "i"
);

const YEAR = /^\(?((?:19|20)\d{2})\)?$/;

/** A token that is *entirely* machine detail, not one that merely contains it. */
function isNoise(token: string) {
  const match = NOISE.exec(token);
  return !!match && match[0].length === token.length;
}

export function cleanVideoTitle(fileName: string) {
  const withoutExtension = fileName.replace(/\.[a-z0-9]{2,5}$/i, "");

  const spaced = withoutExtension
    // Bracketed segments are almost always the release group or a hash.
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/\{[^}]*\}/g, " ")
    // Dots and underscores stand in for spaces in release names. Decimals like
    // "5.1" survive as "5 1", which is harmless: they only ever appear inside
    // the audio tag, and everything from there on is dropped anyway.
    .replace(/[._+]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const tokens = spaced.split(" ").filter(Boolean);

  // A release group hangs off the last technical tag with a dash, so "x264-FLUX"
  // has to come apart. "Spider-Man" must not — only split when doing so exposes
  // something recognisably technical.
  const flat = tokens.flatMap(token => {
    if (!token.includes("-")) return [token];
    const parts = token.split("-").filter(Boolean);
    return parts.some(isNoise) ? parts : [token];
  });

  let year: string | null = null;
  const kept: string[] = [];
  for (const token of flat) {
    const asYear = token.match(YEAR);
    // A leading year is part of the name ("2012", "1917"), not a release year.
    if (asYear && kept.length) {
      year = asYear[1];
      break;
    }
    if (isNoise(token)) break;
    kept.push(token);
  }

  const title = kept.join(" ").replace(/[\s.-]+$/, "").trim();
  // Stripping everything means the guess was wrong; the raw name beats nothing.
  if (!title) return withoutExtension.slice(0, 120);
  return (year ? `${title} (${year})` : title).slice(0, 120);
}
