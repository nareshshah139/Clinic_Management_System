"""
Test script for the /visits/transcribe endpoint with different payload sizes.

This script:
1. Generates audio files of 3 different sizes (small, medium, large)
2. Tests the transcribe endpoint with each file
3. Reports timing and results for each test
"""

import asyncio
import io
import json
import logging
import os
import sys
import time
from pathlib import Path
from typing import Dict, Any, Optional

import httpx

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class TranscribeEndpointTester:
    """Test the transcribe endpoint with different payload sizes."""

    def __init__(
        self,
        base_url: str = "http://localhost:3001",
        username: str = "admin",
        password: str = "admin123",
    ):
        """
        Initialize the tester.

        Args:
            base_url: The base URL of the backend API
            username: Username for authentication
            password: Password for authentication
        """
        self.base_url = base_url.rstrip('/')
        self.username = username
        self.password = password
        self.cookies: Optional[httpx.Cookies] = None
        self.client = httpx.AsyncClient(timeout=300.0)  # 5 min timeout for large files

    async def authenticate(self) -> bool:
        """
        Authenticate with the backend and store session cookies.

        Returns:
            True if authentication successful, False otherwise
        """
        try:
            logger.info(f"Authenticating as {self.username}...")
            response = await self.client.post(
                f"{self.base_url}/auth/login",
                json={"identifier": self.username, "password": self.password}
            )
            
            if response.status_code == 200 or response.status_code == 201:
                self.cookies = response.cookies
                logger.info("✓ Authentication successful")
                return True
            else:
                logger.error(f"✗ Authentication failed: {response.status_code} - {response.text}")
                return False
        except Exception as e:
            logger.error(f"✗ Authentication error: {e}")
            return False

    def generate_audio_file(self, size_bytes: int, filename: str) -> bytes:
        """
        Generate a synthetic audio file (WebM format simulation).
        
        For testing purposes, we create a valid-looking audio buffer.
        In production, you'd use actual audio samples or pydub/ffmpeg.

        Args:
            size_bytes: Target size in bytes
            filename: Name for the file

        Returns:
            Audio file content as bytes
        """
        # Create a simple WebM-like header (simplified for testing)
        # Real WebM has proper EBML structure, but for testing we'll use a minimal valid structure
        
        # WebM header (simplified EBML + Segment)
        webm_header = bytes([
            0x1A, 0x45, 0xDF, 0xA3,  # EBML header
            0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x1F,
            0x42, 0x86, 0x81, 0x01,  # EBMLVersion
            0x42, 0xF7, 0x81, 0x01,  # EBMLReadVersion
            0x42, 0xF2, 0x81, 0x04,  # EBMLMaxIDLength
            0x42, 0xF3, 0x81, 0x08,  # EBMLMaxSizeLength
            0x42, 0x82, 0x88,        # DocType
            0x77, 0x65, 0x62, 0x6D, 0x61, 0x74, 0x72, 0x6F,  # "webmatro"
            0x18, 0x53, 0x80, 0x67,  # Segment
        ])
        
        # Calculate how much padding we need
        padding_size = max(0, size_bytes - len(webm_header) - 100)
        
        # Create padding (simulated audio data)
        # In a real scenario, this would be actual encoded audio
        padding = bytes([i % 256 for i in range(padding_size)])
        
        # Combine header and padding
        audio_data = webm_header + padding
        
        # Add a small footer to make it look more realistic
        footer = bytes([0x00] * (size_bytes - len(audio_data)))
        audio_data += footer
        
        return audio_data[:size_bytes]

    async def test_transcribe(
        self,
        audio_data: bytes,
        filename: str,
        test_name: str
    ) -> Dict[str, Any]:
        """
        Test the transcribe endpoint with given audio data.

        Args:
            audio_data: Audio file content
            filename: Name of the audio file
            test_name: Descriptive name for this test

        Returns:
            Dictionary with test results
        """
        logger.info(f"\n{'='*60}")
        logger.info(f"Testing: {test_name}")
        logger.info(f"File: {filename}")
        logger.info(f"Size: {len(audio_data):,} bytes ({len(audio_data) / 1024:.2f} KB)")
        logger.info(f"{'='*60}")

        if not self.cookies:
            logger.error("✗ Not authenticated. Call authenticate() first.")
            return {
                "test_name": test_name,
                "success": False,
                "error": "Not authenticated"
            }

        try:
            # Prepare multipart form data
            files = {
                'file': (filename, io.BytesIO(audio_data), 'audio/webm')
            }

            # Send request
            start_time = time.time()
            logger.info(f"Sending request to {self.base_url}/visits/transcribe...")
            
            response = await self.client.post(
                f"{self.base_url}/visits/transcribe",
                files=files,
                cookies=self.cookies
            )
            
            elapsed_time = time.time() - start_time

            # Parse response
            result = {
                "test_name": test_name,
                "filename": filename,
                "file_size_bytes": len(audio_data),
                "file_size_kb": len(audio_data) / 1024,
                "status_code": response.status_code,
                "elapsed_time_seconds": elapsed_time,
                "success": response.status_code in [200, 201],
            }

            if response.status_code in [200, 201]:
                try:
                    response_data = response.json()
                    result["response"] = response_data
                    result["transcript_length"] = len(response_data.get("text", ""))
                    result["segments_count"] = len(response_data.get("segments", []))
                    
                    logger.info(f"✓ Status: {response.status_code}")
                    logger.info(f"✓ Elapsed time: {elapsed_time:.2f}s")
                    logger.info(f"✓ Transcript length: {result['transcript_length']} characters")
                    logger.info(f"✓ Segments: {result['segments_count']}")
                    
                    if response_data.get("speakers"):
                        doctor_len = len(response_data["speakers"].get("doctorText", ""))
                        patient_len = len(response_data["speakers"].get("patientText", ""))
                        logger.info(f"✓ Doctor text: {doctor_len} characters")
                        logger.info(f"✓ Patient text: {patient_len} characters")
                        result["doctor_text_length"] = doctor_len
                        result["patient_text_length"] = patient_len
                        
                except Exception as e:
                    logger.warning(f"⚠ Response parsing error: {e}")
                    result["response"] = response.text
            else:
                logger.error(f"✗ Status: {response.status_code}")
                logger.error(f"✗ Response: {response.text}")
                result["error"] = response.text
                result["elapsed_time_seconds"] = elapsed_time

            return result

        except Exception as e:
            logger.error(f"✗ Request failed: {e}")
            return {
                "test_name": test_name,
                "filename": filename,
                "file_size_bytes": len(audio_data),
                "success": False,
                "error": str(e)
            }

    async def run_all_tests(self) -> Dict[str, Any]:
        """
        Run all transcribe endpoint tests with different payload sizes.

        Returns:
            Dictionary with all test results
        """
        logger.info("\n" + "="*60)
        logger.info("TRANSCRIBE ENDPOINT TEST SUITE")
        logger.info("="*60)

        # Authenticate first
        if not await self.authenticate():
            logger.error("Failed to authenticate. Aborting tests.")
            return {"success": False, "error": "Authentication failed"}

        # Define test payloads (size in bytes)
        test_cases = [
            {
                "name": "Small Audio (100 KB)",
                "size_bytes": 100 * 1024,  # 100 KB
                "filename": "test_audio_small.webm"
            },
            {
                "name": "Medium Audio (1 MB)",
                "size_bytes": 1 * 1024 * 1024,  # 1 MB
                "filename": "test_audio_medium.webm"
            },
            {
                "name": "Large Audio (5 MB)",
                "size_bytes": 5 * 1024 * 1024,  # 5 MB
                "filename": "test_audio_large.webm"
            }
        ]

        results = []

        # Run each test
        for test_case in test_cases:
            # Generate audio file
            logger.info(f"\nGenerating {test_case['name']}...")
            audio_data = self.generate_audio_file(
                test_case['size_bytes'],
                test_case['filename']
            )

            # Test the endpoint
            result = await self.test_transcribe(
                audio_data,
                test_case['filename'],
                test_case['name']
            )
            results.append(result)

            # Small delay between tests
            await asyncio.sleep(1)

        # Summary
        logger.info("\n" + "="*60)
        logger.info("TEST SUMMARY")
        logger.info("="*60)
        
        for result in results:
            status = "✓ PASS" if result.get("success") else "✗ FAIL"
            logger.info(f"\n{status} - {result['test_name']}")
            logger.info(f"  Size: {result.get('file_size_kb', 0):.2f} KB")
            if result.get("success"):
                logger.info(f"  Time: {result.get('elapsed_time_seconds', 0):.2f}s")
                logger.info(f"  Transcript: {result.get('transcript_length', 0)} chars")
            else:
                logger.info(f"  Error: {result.get('error', 'Unknown error')}")

        # Calculate statistics
        successful_tests = [r for r in results if r.get("success")]
        total_tests = len(results)
        passed_tests = len(successful_tests)
        
        logger.info("\n" + "-"*60)
        logger.info(f"Total Tests: {total_tests}")
        logger.info(f"Passed: {passed_tests}")
        logger.info(f"Failed: {total_tests - passed_tests}")
        logger.info(f"Success Rate: {(passed_tests/total_tests)*100:.1f}%")
        
        if successful_tests:
            avg_time = sum(r.get('elapsed_time_seconds', 0) for r in successful_tests) / len(successful_tests)
            logger.info(f"Average Response Time: {avg_time:.2f}s")

        return {
            "success": passed_tests == total_tests,
            "total": total_tests,
            "passed": passed_tests,
            "failed": total_tests - passed_tests,
            "results": results
        }

    async def close(self):
        """Close the HTTP client."""
        await self.client.aclose()


async def main():
    """Main entry point for the test script."""
    # Parse command line arguments
    base_url = os.getenv("BACKEND_URL", "http://localhost:4000")
    username = os.getenv("TEST_USERNAME", "admin@clinic.test")
    password = os.getenv("TEST_PASSWORD", "password123")

    # Create tester instance
    tester = TranscribeEndpointTester(
        base_url=base_url,
        username=username,
        password=password
    )

    try:
        # Run all tests
        results = await tester.run_all_tests()

        # Save results to file
        output_file = Path(__file__).parent / "transcribe_test_results.json"
        with open(output_file, 'w') as f:
            json.dump(results, f, indent=2)
        
        logger.info(f"\n✓ Results saved to: {output_file}")

        # Exit with appropriate code
        sys.exit(0 if results.get("success") else 1)

    finally:
        await tester.close()


if __name__ == "__main__":
    asyncio.run(main())

