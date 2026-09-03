"""
NexaStore AI Publisher Client

Simple Python library for AI systems to autonomously publish applications to NexaStore.

Usage:
    from nexastore_client import NexaStoreClient
    
    client = NexaStoreClient(api_key="nxs_live_...")
    
    app_id = client.submit_app(
        name="MyApp",
        tagline="Brief description",
        description="Full description",
        category="Tools",
        app_file_path="app.apk",
        logo_path="logo.png",
        screenshot_paths=["ss1.png", "ss2.png", "ss3.png"]
    )
    
    print(f"App published: {app_id}")
    print(f"View at: https://nexastore-baj.pages.dev?app={app_id}")
"""

import requests
import base64
import os
from pathlib import Path


class NexaStoreClient:
    """
    Autonomous NexaStore AI Publisher Client
    
    Handles complete app submission workflow:
    1. Create app listing with metadata
    2. Upload logo and screenshots
    3. Upload app file in chunks
    4. Run security scan
    5. Return app ID
    """
    
    BASE_URL = "https://mapswtriwoxlscjdakpk.supabase.co"
    BIT_SIZE = 47185920  # 45 MB
    
    def __init__(self, api_key: str):
        """
        Initialize client with API key.
        
        Args:
            api_key: NexaStore API key (starts with nxs_live_)
        """
        self.api_key = api_key
        self.headers = {"x-nexastore-key": api_key}
    
    def _file_to_data_url(self, file_path: str) -> str:
        """Convert a file to base64 data URL."""
        path = Path(file_path)
        mime_type = self._guess_mime_type(path.suffix)
        
        with open(file_path, "rb") as f:
            b64 = base64.b64encode(f.read()).decode()
        
        return f"data:{mime_type};base64,{b64}"
    
    def _guess_mime_type(self, ext: str) -> str:
        """Guess MIME type from file extension."""
        mime_types = {
            ".png": "image/png",
            ".jpg": "image/jpeg",
            ".jpeg": "image/jpeg",
            ".webp": "image/webp",
            ".apk": "application/vnd.android.package-archive",
            ".exe": "application/x-msdownload",
            ".zip": "application/zip",
            ".aab": "application/x-gzip",
        }
        return mime_types.get(ext.lower(), "application/octet-stream")
    
    def submit_app(
        self,
        name: str,
        tagline: str,
        description: str,
        category: str,
        app_file_path: str,
        logo_path: str = None,
        screenshot_paths: list = None,
        price: float = 0,
        version: str = "1.0.0",
        release_notes: str = "",
    ) -> str:
        """
        Submit a complete app to NexaStore.
        
        Args:
            name: App name (required)
            tagline: One-liner, max 80 chars (required)
            description: Full description (required)
            category: One of Productivity, Business, Tools, Games, Social, Photography, Finance, Education (required)
            app_file_path: Path to APK/EXE/ZIP file (required)
            logo_path: Path to logo image (optional)
            screenshot_paths: List of screenshot image paths, minimum 3 required (optional)
            price: USD price, 0 for free (default: 0)
            version: Semantic version (default: "1.0.0")
            release_notes: What's new (default: "")
        
        Returns:
            str: App ID if successful
        
        Raises:
            ValueError: If required fields are missing or invalid
            requests.RequestException: If API call fails
        """
        
        # Validate required fields
        if not all([name, tagline, description, category, app_file_path]):
            raise ValueError("Missing required fields: name, tagline, description, category, app_file_path")
        
        # Validate category
        valid_categories = [
            "Productivity", "Business", "Tools", "Games", 
            "Social", "Photography", "Finance", "Education"
        ]
        if category not in valid_categories:
            raise ValueError(f"Invalid category. Must be one of: {', '.join(valid_categories)}")
        
        # Validate file exists
        if not Path(app_file_path).exists():
            raise ValueError(f"App file not found: {app_file_path}")
        
        # Validate screenshots if provided
        if screenshot_paths:
            if len(screenshot_paths) < 3:
                raise ValueError("Minimum 3 screenshots required")
            if len(screenshot_paths) > 10:
                raise ValueError("Maximum 10 screenshots allowed")
            for path in screenshot_paths:
                if not Path(path).exists():
                    raise ValueError(f"Screenshot not found: {path}")
        
        # Validate logo if provided
        if logo_path and not Path(logo_path).exists():
            raise ValueError(f"Logo file not found: {logo_path}")
        
        # Get file info
        file_size = os.path.getsize(app_file_path)
        file_name = Path(app_file_path).name
        file_type = self._guess_mime_type(Path(app_file_path).suffix)
        
        print(f"📦 Submitting: {name}")
        print(f"   File: {file_name} ({file_size:,} bytes)")
        
        # Step 1: Create app listing with logo and screenshots
        print("✓ Step 1/3: Creating app listing...")
        
        app_data = {
            "name": name,
            "tagline": tagline,
            "description": description,
            "category": category,
            "price": price,
            "version": version,
            "release_notes": release_notes,
            "file_name": file_name,
            "file_type": file_type,
            "total_size_bytes": file_size,
        }
        
        # Add logo if provided
        if logo_path:
            app_data["logo"] = self._file_to_data_url(logo_path)
            print(f"  └─ Logo uploaded: {Path(logo_path).name}")
        
        # Add screenshots if provided
        if screenshot_paths:
            app_data["screenshots"] = [self._file_to_data_url(p) for p in screenshot_paths]
            print(f"  └─ {len(screenshot_paths)} screenshots uploaded")
        
        resp = requests.post(
            f"{self.BASE_URL}/functions/v1/ai-create-app",
            json=app_data,
            headers={**self.headers, "Content-Type": "application/json"}
        )
        resp.raise_for_status()
        result = resp.json()
        app_id = result["app_id"]
        bit_count = result["bit_count"]
        
        print(f"  └─ App created: {app_id}")
        
        # Step 2: Upload file bits
        print(f"✓ Step 2/3: Uploading app file ({bit_count} chunks)...")
        
        with open(app_file_path, "rb") as f:
            file_data = f.read()
        
        for i in range(bit_count):
            start = i * self.BIT_SIZE
            end = min((i + 1) * self.BIT_SIZE, len(file_data))
            chunk = file_data[start:end]
            
            resp = requests.post(
                f"{self.BASE_URL}/functions/v1/ai-upload-bit?app_id={app_id}&bit_index={i}",
                data=chunk,
                headers=self.headers
            )
            resp.raise_for_status()
            
            pct = int((i + 1) / bit_count * 100)
            print(f"  └─ Bit {i + 1}/{bit_count} ({pct}%)")
        
        # Step 3: Finalize and scan
        print("✓ Step 3/3: Running security scan...")
        
        resp = requests.post(
            f"{self.BASE_URL}/functions/v1/ai-finalize",
            json={"app_id": app_id},
            headers={**self.headers, "Content-Type": "application/json"}
        )
        resp.raise_for_status()
        scan_result = resp.json()
        
        scan_status = scan_result.get("scan_status", "unknown")
        scan_notes = scan_result.get("scan_notes", "")
        
        if scan_status == "clean":
            print(f"  └─ Security scan: ✓ PASSED")
        elif scan_status == "flagged":
            print(f"  └─ Security scan: ⚠ FLAGGED")
            if scan_notes:
                print(f"     {scan_notes}")
        else:
            print(f"  └─ Security scan: {scan_status}")
        
        print()
        print(f"✅ App published successfully!")
        print(f"   App ID: {app_id}")
        print(f"   Status: Pending owner approval")
        print(f"   View: https://nexastore-baj.pages.dev")
        
        return app_id


def main():
    """Example usage."""
    import sys
    
    api_key = os.getenv("NEXASTORE_API_KEY")
    if not api_key:
        print("Error: NEXASTORE_API_KEY environment variable not set")
        sys.exit(1)
    
    client = NexaStoreClient(api_key)
    
    # Example: Submit an app
    try:
        app_id = client.submit_app(
            name="Example App",
            tagline="An example application",
            description="This is an example app created by an AI system.",
            category="Tools",
            app_file_path="example.zip",
            logo_path="logo.png",
            screenshot_paths=["screenshot1.png", "screenshot2.png", "screenshot3.png"],
        )
    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
