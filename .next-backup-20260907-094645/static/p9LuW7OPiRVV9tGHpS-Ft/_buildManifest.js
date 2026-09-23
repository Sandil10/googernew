self.__BUILD_MANIFEST = {
  "/_error": [
    "static/chunks/6fa2962e6f8c239e.js"
  ],
  "__rewrites": {
    "afterFiles": [
      {
        "source": "/api/:path*"
      },
      {
        "source": "/uploads/:path*"
      },
      {
        "source": "/socket.io/:path*"
      },
      {
        "source": "/shop/:id",
        "destination": "/dashboard/shop?id=:id"
      },
      {
        "source": "/shop/:id/:reseller",
        "destination": "/dashboard/shop?id=:id&reseller=:reseller"
      }
    ],
    "beforeFiles": [],
    "fallback": []
  },
  "sortedPages": [
    "/_app",
    "/_error",
    "/api/migrate",
    "/api/upload-control-settings",
    "/api/[...slug]"
  ]
};self.__BUILD_MANIFEST_CB && self.__BUILD_MANIFEST_CB()