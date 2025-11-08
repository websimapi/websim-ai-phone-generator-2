// The websim object is globally available and does not need to be imported.

const promptInput = document.getElementById('prompt-input');
const generateBtn = document.getElementById('generate-btn');
const loader = document.getElementById('loader');
const canvas = document.getElementById('phone-canvas');
const ctx = canvas.getContext('2d', { willReadFrequently: true });

let timeInterval = null;
let originalImageWithBlackScreen = null; // To store the phone image with the black screen

generateBtn.addEventListener('click', generatePhone);
promptInput.addEventListener('keyup', (e) => {
    if (e.key === 'Enter') {
        generatePhone();
    }
});

function setLoading(isLoading) {
    generateBtn.disabled = isLoading;
    promptInput.disabled = isLoading;
    if (isLoading) {
        loader.classList.remove('hidden');
    } else {
        loader.classList.add('hidden');
    }
}

async function generatePhone() {
    const userPrompt = promptInput.value.trim();
    if (!userPrompt) {
        alert('Please enter a description for the phone.');
        return;
    }

    if (timeInterval) {
        clearInterval(timeInterval);
        timeInterval = null;
    }

    setLoading(true);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    originalImageWithBlackScreen = null;

    // A specific, vibrant pink is used to make detection easier and more reliable.
    const fullPrompt = `A front-facing close-up of ${userPrompt}, smartphone, with a solid bright fuchsia pink (#FF00FF) screen, on a transparent background, studio lighting, photorealistic.`;

    try {
        const result = await websim.imageGen({
            prompt: fullPrompt,
            transparent: true,
            width: 512,
            height: 768,
            aspect_ratio: "2:3"
        });
        processImage(result.url);
    } catch (error) {
        console.error('Error generating image:', error);
        alert('Failed to generate image. Please try again.');
        setLoading(false);
    }
}

function processImage(imageUrl) {
    const img = new Image();
    img.crossOrigin = "Anonymous"; // Required for loading images from other domains into canvas
    img.onload = () => {
        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);

        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        const width = canvas.width;
        const height = canvas.height;

        // Get the color of the center pixel as the target "pink"
        const centerX = Math.floor(width / 2);
        const centerY = Math.floor(height / 2);
        const centerIndex = (centerY * width + centerX) * 4;
        const targetColor = {
            r: data[centerIndex],
            g: data[centerIndex + 1],
            b: data[centerIndex + 2]
        };

        const colorThreshold = 150; // Increased threshold for a softer blend
        let screenBounds = { minX: width, minY: height, maxX: 0, maxY: 0 };
        let foundScreen = false;

        // Process pixels in a single pass with blending
        for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            const a = data[i + 3];

            // Skip transparent pixels
            if (a === 0) continue;

            const currentColor = { r, g, b };
            const distance = colorDistance(currentColor, targetColor);

            // Calculate blend factor (0 = no change, 1 = fully black for screen)
            const blendFactor = Math.min(1, Math.max(0, 1 - distance / colorThreshold));

            if (blendFactor > 0.1) { // Process if there's any significant pink tint
                 // Determine if this is part of the screen or just reflection
                const isScreen = blendFactor > 0.9;
                
                if (isScreen) {
                    // This is the screen, make it black
                    data[i] = 0;
                    data[i + 1] = 0;
                    data[i + 2] = 0;
                } else {
                    // This is likely a pink reflection on the phone body. Neutralize it.
                    // We reduce the red and blue channels towards the green channel's level
                    // which is effective at removing magenta/pink tints.
                    const pinkTintFactor = blendFactor;
                    data[i] = r * (1 - pinkTintFactor) + g * pinkTintFactor; // Reduce red towards green
                    data[i + 2] = b * (1 - pinkTintFactor) + g * pinkTintFactor; // Reduce blue towards green
                }

                // If a pixel is significantly part of the screen, use it for bounds calculation
                if (blendFactor > 0.5) { 
                    const pixelIndex = i / 4;
                    const x = pixelIndex % width;
                    const y = Math.floor(pixelIndex / width);
                    screenBounds.minX = Math.min(screenBounds.minX, x);
                    screenBounds.minY = Math.min(screenBounds.minY, y);
                    screenBounds.maxX = Math.max(screenBounds.maxX, x);
                    screenBounds.maxY = Math.max(screenBounds.maxY, y);
                    foundScreen = true;
                }
            }
        }

        ctx.putImageData(imageData, 0, 0);

        // Store this canvas state to redraw from
        originalImageWithBlackScreen = new Image();
        originalImageWithBlackScreen.src = canvas.toDataURL();
        originalImageWithBlackScreen.onload = () => {
            if (foundScreen) {
                startClock(screenBounds);
            }
        };

        setLoading(false);
    };
    img.onerror = () => {
        alert('Failed to load the generated image.');
        setLoading(false);
    };
    img.src = imageUrl;
}

function colorDistance(c1, c2) {
    const rmean = (c1.r + c2.r) / 2;
    const r = c1.r - c2.r;
    const g = c1.g - c2.g;
    const b = c1.b - c2.b;
    return Math.sqrt((((512 + rmean) * r * r) >> 8) + 4 * g * g + (((767 - rmean) * b * b) >> 8));
}

function startClock(bounds) {
    if (timeInterval) {
        clearInterval(timeInterval);
    }

    const drawTime = () => {
        if (!originalImageWithBlackScreen || !originalImageWithBlackScreen.complete) return;

        // Redraw the base image to clear old time
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(originalImageWithBlackScreen, 0, 0);

        const now = new Date();
        const timeString = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

        const screenWidth = bounds.maxX - bounds.minX;
        const centerX = bounds.minX + screenWidth / 2;
        const centerY = bounds.minY + (bounds.maxY - bounds.minY) / 2;

        ctx.fillStyle = 'white';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // Dynamically adjust font size based on screen width
        const fontSize = Math.max(12, Math.floor(screenWidth / 8));
        ctx.font = `bold ${fontSize}px sans-serif`;

        ctx.fillText(timeString, centerX, centerY);
    };

    drawTime(); // Initial draw
    timeInterval = setInterval(drawTime, 1000);
}