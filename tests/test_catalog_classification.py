import unittest
from product_catalog import classify_product, image_for_product

class CatalogClassificationTests(unittest.TestCase):
    def test_ai_products(self):
        cases = {"ChatGPT Plus - 1 Month":"ChatGPT", "Gemini Pro 18 Months":"Gemini",
                 "Claude Pro":"Claude", "DeepSeek Premium":"DeepSeek",
                 "Cursor AI Pro":"Cursor AI", "ElevenLabs Creator":"ElevenLabs"}
        for name, expected in cases.items():
            with self.subTest(name=name):
                self.assertEqual(classify_product(name), expected)

    def test_other_categories(self):
        cases = {"Netflix Premium":"Streaming", "Spotify Premium":"Music",
                 "Discord Nitro":"Discord", "NordVPN 1 Year":"VPN"}
        for name, expected in cases.items():
            with self.subTest(name=name):
                self.assertEqual(classify_product(name), expected)

    def test_unknown_product_uses_safe_fallback(self):
        self.assertEqual(classify_product("Mystery digital plan"), "Subscriptions")
        self.assertIsNone(image_for_product("Mystery digital plan", "Subscriptions"))

    def test_brand_image_is_stable(self):
        self.assertEqual(image_for_product("ChatGPT Plus", "ChatGPT"), "https://api.clearlogo.dev/logo/openai.com?size=512")

if __name__ == "__main__":
    unittest.main()
