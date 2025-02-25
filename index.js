const express = require("express");
const multer = require("multer");
const puppeteer = require("puppeteer");

const app = express();
const upload = multer(); // Middleware for parsing form data
app.use(express.json()); // For parsing application/json

// Serve HTML form
app.get("/", (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head><title>Website Screenshot</title></head>
    <body>
        <h1>Generate a Screenshot</h1>
        <form action="/screenshot" method="post" enctype="multipart/form-data">
            <input type="text" name="url" placeholder="https://example.com" required>
            <button type="submit">Generate Screenshot</button>
        </form>
        <hr>
        <h1>Generate Slides PDF</h1>
        <p>Send a POST request to /slides with JSON body containing "slides" array</p>
    </body>
    </html>
  `);
});

// Handle screenshot generation
app.post("/screenshot", upload.none(), async (req, res) => {
  const url = req.body.url;
  if (!/^https?:\/\/.+$/.test(url)) return res.status(400).send("Invalid URL.");

  try {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    await page.goto(url, { timeout: 60000 });
    const screenshotBuffer = await page.screenshot({ type: "png" });
    await browser.close();

    // Embed screenshot as base64 in HTML
    res.send(`
      <!DOCTYPE html>
      <html>
      <head><title>Screenshot Result</title></head>
      <body>
          <h1>Screenshot of ${url}</h1>
          <img src="data:image/png;base64,${screenshotBuffer.toString(
            "base64"
          )}" style="max-width:100%;height:auto;">
          <br><a href="/">Back to form</a>
      </body>
      </html>
    `);
  } catch (error) {
    console.error("Screenshot error:", error);
    res.status(500).send("Failed to generate screenshot.");
  }
});

// Handle slides PDF generation
app.post("/slides", async (req, res) => {
  try {
    const { slides } = req.body;

    if (!slides || !Array.isArray(slides) || slides.length === 0) {
      return res
        .status(400)
        .json({ error: "No slides provided or invalid format" });
    }

    // Process list items for better rendering
    const processedSlides = slides.map((slide) => {
      // Pattern to match li elements containing p and span tags
      const pattern =
        /<li>\s*<p>\s*<span style=[\'"]([^\'"]+)[\'"]>(.*?)<\/span>\s*<\/p>\s*<\/li>/g;

      // Replace with simplified structure, moving style to li
      const replacement = '<li style="$1">$2</li>';

      return slide.replace(pattern, replacement);
    });

    // Create full HTML with exact styles and font
    const fullHtml = createSlidesHtml(processedSlides);

    // Initialize browser
    const browser = await puppeteer.launch({
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--single-process",
      ],
      headless: true,
    });

    const page = await browser.newPage();

    // Set viewport to match slide dimensions in landscape
    await page.setViewport({
      width: 1080,
      height: 810,
      deviceScaleFactor: 1,
      hasTouch: false,
    });

    await page.setContent(fullHtml, { waitUntil: "networkidle0" });

    // Generate PDF with all pages first
    const fullPdf = await page.pdf({
      format: "A4",
      landscape: true,
      printBackground: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
      width: "1080px",
      height: "810px",
      preferCSSPageSize: true,
      scale: 1.0,
    });

    // Create a pageRanges string that includes only odd-numbered pages
    // For example, if there are 5 pages, this will be "1,3,5"
    const oddPagesRanges = Array.from(
      { length: Math.ceil(slides.length / 2) },
      (_, i) => i * 2 + 1
    )
      .filter((pageNum) => pageNum <= slides.length)
      .join(",");

    // Generate a new PDF with only odd-numbered pages
    const filteredPdf = await page.pdf({
      format: "A4",
      landscape: true,
      printBackground: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
      width: "1080px",
      height: "810px",
      preferCSSPageSize: true,
      scale: 1.0,
      pageRanges: oddPagesRanges, // Specify only odd-numbered pages
      displayHeaderFooter: false,
    });

    await browser.close();

    // Return the filtered PDF as a downloadable file
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="ai_slides.pdf"'
    );
    return res.send(filteredPdf);
  } catch (error) {
    console.error("Error generating PDF:", error);
    return res
      .status(500)
      .json({ error: "An error occurred while generating the PDF" });
  }
});

// Function to create HTML for the slides
function createSlidesHtml(slides) {
  return `
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          @font-face {
            font-family: 'Liberation Sans';
            src: url('https://fonts.gstatic.com/s/liberationsans/v14/mem5YaGs126MiZpBA-UN_r8OUuhp.ttf') format('truetype');
          }
          @page {
            size: 1080px 810px landscape;
            margin: 0;
            orientation: landscape;
          }
          body { 
            margin: 0; 
            padding: 0;
            width: 1080px;
            height: 810px;
            font-family: 'Liberation Sans', Arial, 'Helvetica Neue', Helvetica, sans-serif;
            transform-origin: top left;
            transform: rotate(0deg);
          }
          .slide {
            font-family: 'Liberation Sans', Arial, 'Helvetica Neue', Helvetica, sans-serif;
            position: relative;
            background-color: #ffffff;
            width: 1080px;
            height: 810px;
            margin: 0;
            page-break-after: always;
            break-after: page;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            overflow: hidden !important;
            display: block !important;
          }
          .slide div {
            min-width: 0;
            position: absolute;
            box-sizing: border-box;
            padding: 0;
            overflow: hidden !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            max-height: 810px;
          }
          .slide img {
            width: 100%;
            height: auto;
            -webkit-user-drag: none;
            user-drag: none;
            max-width: none;
            max-height: none;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            page-break-before: auto !important;
            break-before: auto !important;
            page-break-after: auto !important;
            break-after: auto !important;
            display: block;
            object-fit: contain;
          }
          .slide h1,
          .slide h2,
          .slide h3,
          .slide h4,
          .slide h5,
          .slide h6,
          .slide p,
          .slide span,
          .slide li,
          .slide div {
            font-family: 'Liberation Sans', Arial, 'Helvetica Neue', Helvetica, sans-serif;
          }
          .slide li::marker {
            color: #0095ff;
          }
          .slide p:last-child {
            margin-bottom: 0 !important;
          }
          .slide p:first-child {
            margin-top: 0 !important;
          }
          /* List specific styles - updated to match Python implementation */
          .slide ol, 
          .slide ul {
            margin: 0;
            padding-left: 1.5em;
            list-style-position: outside;
          }
          .slide ol {
            padding-left: 1.5555556em;
            list-style-type: decimal;
          }
          .slide ul {
            padding-left: 1.5555556em;
            list-style-type: disc;
          }
          .slide ul ul {
            margin-left: 10px;
            list-style-type: circle;
          }
          .slide ul ul ul {
            margin-left: 10px;
            list-style-type: square;
          }
          .slide ul li:last-child,
          .slide ol li:last-child {
            margin-bottom: 0.6666667em !important;
          }
          .slide hr {
            border-top: 2px solid rgba(13, 13, 13, 0.1);
            margin: 1rem 0;
          }
          .slide br {
            margin: 0;
          }
          .slide a[href] {
            color: #0095ff;
            text-decoration: underline #0095ff;
          }
          div[data-type="title"] {
            line-height: 1.2;
          }
          div[data-type="title"] strong {
            display: block;
          }
          div[data-type="paragraph"] {
            overflow: visible;
            word-wrap: break-word;
            line-height: 1.6;
            padding: 0;
          }
          div[data-type="paragraph"] > span {
            display: block;
            width: 100%;
            height: 100%;
            box-sizing: border-box;
          }
          div[data-type="paragraph"] p {
            margin: 0 0 1em 0;
          }
          /* Additional paragraph list styles from Python */
          div[data-type="paragraph"] ul {
            margin: 0.5em 0;
            padding-left: 1.5em;
            list-style-position: outside;
          }
          div[data-type="paragraph"] li {
            margin-bottom: 0.5em;
            line-height: 1.6;
          }
          [style*="width"],
          [style*="height"] {
            box-sizing: border-box !important;
          }
          [style*="font-size: 20px"] {
            line-height: 1.6;
            letter-spacing: 0.01em;
          }
          div[data-type="image"] {
            display: block;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            page-break-before: auto !important;
            break-before: auto !important;
            page-break-after: auto !important;
            break-after: auto !important;
            overflow: hidden !important;
            contain: layout paint;
          }
          /* Two-column layout support */
          .two-column > * {
            width: 100%;
            overflow-wrap: break-word;
            column-count: 2;
          }
          .two-column-content > div > * {
            width: 100%;
            overflow-wrap: break-word;
            column-count: 2;
          }
          /* Text wrapper functionality */
          text-wrapper-left::after {
            content: "";
            display: table;
            clear: both;
            position: relative;
          }
          text-wrapper-right::after {
            content: "";
            display: table;
            clear: both;
            position: relative;
          }
          /* Image alignment rules */
          div:has(div > img):has(+ text-wrapper-left),
          img:has(+ text-wrapper-left) {
            float: left;
            margin-top: 0 !important;
            margin-right: 1rem;
            margin-bottom: 1rem;
          }
          div:has(div > img):has(+ text-wrapper-right),
          img:has(+ text-wrapper-right) {
            float: right;
            margin-top: 0 !important;
            margin-left: 1rem;
            margin-bottom: 1rem;
          }
          .slide a:hover {
            color: #1c89d6;
          }
          /* Adjusted list styles */
          .slide ol,
          .slide ul {
            padding-left: 1.5555556em;
            margin: 0.5em 0;
          }
          .slide ol {
            list-style-type: decimal;
          }
          .slide ul {
            list-style-type: disc;
          }
          .slide ul ul {
            margin-left: 10px;
            list-style-type: circle;
          }
          .slide ul ul ul {
            margin-left: 10px;
            list-style-type: square;
          }
          /* Ensure consistent list styling within the slide */
          .slide ol, .slide ul {
            margin: 0;
            padding-left: 2em;
            list-style-position: outside;
          }
          /* If additional tweaking is needed for paragraphs */
          div[data-type="paragraph"] ul {
            margin: 0;
            padding-left: 2em;
            list-style-position: outside;
          }
        </style>
      </head>
      <body>
        ${slides
          .map(
            (slide, index) =>
              `<div class="slide" id="slide-${
                index + 1
              }" style="contain: layout size;">${slide}</div>`
          )
          .join("")}
      </body>
    </html>
  `;
}

// Start server
const PORT = process.env.PORT || 8080;
app.listen(PORT, () =>
  console.log(`Server running on http://localhost:${PORT}`)
);
