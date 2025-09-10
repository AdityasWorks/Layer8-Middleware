import cv2
import pytesseract
import numpy as np
import os
from app.pipeline.pipeline import detect_pii

# Assumes your own working detect_pii function is defined somewhere and imported
# from pii_detection import detect_pii

class ImageAnonymizer:
    def __init__(self, mode="regex"):
        """
        Initialize the anonymizer.

        :param mode: PII detection mode ("regex", "llm", "ner")
        """
        self.mode = mode

    def extract_text_with_coordinates(self, image):
        """
        Extract OCR text and bounding boxes from a given image (np.array).
        """
        rgb_image = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
        data = pytesseract.image_to_data(rgb_image, output_type=pytesseract.Output.DICT)
        return data

    def get_full_text(self, text_data):
        """
        Combine OCR words into full text with confidence filtering.
        """
        return " ".join(
            text_data['text'][i]
            for i in range(len(text_data['text']))
            if text_data['text'][i].strip() and int(text_data['conf'][i]) > 30
        )

    def find_matching_boxes(self, text_data, pii_items):
        """
        Match detected PII values with OCR words and return bounding boxes.
        """
        boxes = []
        for i, word in enumerate(text_data['text']):
            word = word.strip()
            if not word:
                continue
            for pii in pii_items:
                pii_val = pii['value']
                if (word.lower() in pii_val.lower() or pii_val.lower() in word.lower()):
                    x, y, w, h = text_data['left'][i], text_data['top'][i], text_data['width'][i], text_data['height'][i]
                    if int(text_data['conf'][i]) > 30 and w > 0 and h > 0:
                        boxes.append((x, y, w, h))
        return boxes

    def mask_regions(self, image, boxes, mask_type="blur"):
        """
        Apply selected masking method to given regions in the image.
        """
        masked = image.copy()
        for x, y, w, h in boxes:
            pad = 8
            x, y = max(0, x - pad), max(0, y - pad)
            w, h = min(masked.shape[1] - x, w + 2 * pad), min(masked.shape[0] - y, h + 2 * pad)
            roi = masked[y:y+h, x:x+w]

            if mask_type == 'blur':
                k = max(51, (min(w, h) // 2) | 1)
                for _ in range(3):
                    roi = cv2.GaussianBlur(roi, (k, k), 0)
                masked[y:y+h, x:x+w] = roi

            elif mask_type == 'blackout':
                cv2.rectangle(masked, (x, y), (x+w, y+h), (0, 0, 0), -1)

            elif mask_type == 'pixelate':
                small = cv2.resize(roi, (max(1, w // 10), max(1, h // 10)), interpolation=cv2.INTER_LINEAR)
                pixelated = cv2.resize(small, (w, h), interpolation=cv2.INTER_NEAREST)
                masked[y:y+h, x:x+w] = pixelated

        return masked

    def anonymize_image(self, image_path, mask_type='blur', ignore_safety=False):
        """
        Full pipeline: load image, detect PII, and return masked image as np.array.
        
        :param image_path: Path to input image
        :param mask_type: 'blur', 'blackout', or 'pixelate'
        :param ignore_safety: If True, mask all detected PII regardless of safety flag
        :return: masked image as NumPy array
        """
        image = cv2.imread(image_path)
        if image is None:
            raise ValueError(f"Could not load image: {image_path}")

        text_data = self.extract_text_with_coordinates(image)
        full_text = self.get_full_text(text_data)
        pii_items = detect_pii(full_text, self.mode)

        # Respect `safe_to_mask` unless overridden
        filtered_pii = [
            pii for pii in pii_items.get(self.mode, [])
            if ignore_safety or pii.get('safe_to_mask', True)
        ]

        if not filtered_pii:
            print("No PII to mask.")
            return image

        boxes = self.find_matching_boxes(text_data, filtered_pii)
        if not boxes:
            print("PII detected, but no matching text regions found in image.")
            return image

        masked_image = self.mask_regions(image, boxes, mask_type)
        return masked_image
    def anonymize_image_array(self, image, mask_type='blur', ignore_safety=False):
        """
        Anonymize an image passed as a NumPy array instead of a file path.
        """
        text_data = self.extract_text_with_coordinates(image)
        full_text = self.get_full_text(text_data)
        pii_items = detect_pii(full_text, self.mode)

        filtered_pii = [
            pii for pii in pii_items.get(self.mode, [])
            if ignore_safety or pii.get('safe_to_mask', True)
        ]

        if not filtered_pii:
            print("No PII to mask.")
            return image

        boxes = self.find_matching_boxes(text_data, filtered_pii)
        if not boxes:
            print("PII detected, but no matching OCR regions found.")
            return image

        masked_image = self.mask_regions(image, boxes, mask_type)
        return masked_image
