# Unit tests for weather storage cleaner (testweathercleaner.py)

import os
import tempfile
import time
import unittest
from pathlib import Path

from weather.cleaner import get_dir_size, cleanup_weather_folder


class TestWeatherCleaner(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.test_path = Path(self.temp_dir.name)

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_get_dir_size(self):
        file1 = self.test_path / "file1.bin"
        file2 = self.test_path / "subdir" / "file2.bin"
        file2.parent.mkdir(parents=True, exist_ok=True)

        file1.write_bytes(b"A" * 1000)
        file2.write_bytes(b"B" * 2000)

        total_size = get_dir_size(self.test_path)
        self.assertEqual(total_size, 3000)

    def test_cleanup_under_limit(self):
        file1 = self.test_path / "file1.bin"
        file1.write_bytes(b"A" * 1000)

        res = cleanup_weather_folder(self.test_path, max_bytes=5000, target_bytes=3000)
        self.assertEqual(res["deleted_files"], 0)
        self.assertEqual(res["cleaned_bytes"], 0)
        self.assertTrue(file1.exists())

    def test_cleanup_over_limit_deletes_oldest_first(self):
        # Create 3 files with explicit modification times
        f1 = self.test_path / "old.bin"
        f2 = self.test_path / "medium.bin"
        f3 = self.test_path / "new.bin"

        now = time.time()
        f1.write_bytes(b"1" * 1000)
        os.utime(f1, (now - 300, now - 300))

        f2.write_bytes(b"2" * 1000)
        os.utime(f2, (now - 200, now - 200))

        f3.write_bytes(b"3" * 1000)
        os.utime(f3, (now - 100, now - 100))

        # Total size = 3000 bytes. Max limit = 2500 bytes, Target = 1500 bytes.
        # Should delete old.bin (1000B) -> 2000B left. Still > 1500B.
        # Should delete medium.bin (1000B) -> 1000B left <= 1500B. Stops.
        res = cleanup_weather_folder(self.test_path, max_bytes=2500, target_bytes=1500)

        self.assertEqual(res["deleted_files"], 2)
        self.assertFalse(f1.exists())
        self.assertFalse(f2.exists())
        self.assertTrue(f3.exists())

    def test_cleanup_empty_directories(self):
        sub_dir = self.test_path / "empty_sub"
        sub_dir.mkdir()

        f1 = self.test_path / "empty_sub" / "file.bin"
        f1.write_bytes(b"X" * 1000)

        res = cleanup_weather_folder(self.test_path, max_bytes=500, target_bytes=0)
        self.assertEqual(res["deleted_files"], 1)
        self.assertFalse(f1.exists())
        self.assertFalse(sub_dir.exists())


if __name__ == "__main__":
    unittest.main()
