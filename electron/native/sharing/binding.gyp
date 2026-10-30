{
  "targets": [
    {
      "target_name": "sharing",
      "conditions": [
        [
          "OS=='mac'",
          {
            "sources": ["sharing.mm"],
            "defines": ["NAPI_VERSION=8"],
            "xcode_settings": {
              "CLANG_ENABLE_OBJC_ARC": "YES",
              "MACOSX_DEPLOYMENT_TARGET": "13.0",
              "OTHER_LDFLAGS": ["-framework AppKit"]
            }
          }
        ]
      ]
    }
  ]
}
