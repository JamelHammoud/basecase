{
  "targets": [
    {
      "target_name": "vision",
      "conditions": [
        [
          "OS=='mac'",
          {
            "sources": ["vision.mm"],
            "defines": ["NAPI_VERSION=8"],
            "xcode_settings": {
              "CLANG_ENABLE_OBJC_ARC": "YES",
              "CLANG_CXX_LANGUAGE_STANDARD": "c++17",
              "MACOSX_DEPLOYMENT_TARGET": "13.0",
              "OTHER_LDFLAGS": [
                "-framework Foundation",
                "-framework Vision",
                "-framework ImageIO",
                "-framework CoreVideo",
                "-framework CoreGraphics"
              ]
            }
          }
        ]
      ]
    }
  ]
}
