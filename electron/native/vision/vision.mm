#import <CoreVideo/CoreVideo.h>
#import <Foundation/Foundation.h>
#import <ImageIO/ImageIO.h>
#import <Vision/Vision.h>
#include <node_api.h>
#include <string>
#include <vector>

struct MaskJob {
  napi_async_work work = NULL;
  napi_deferred deferred = NULL;
  std::vector<uint8_t> input;
  int maxSide = 1024;
  int width = 0;
  int height = 0;
  std::vector<std::vector<uint8_t>> instances;
  std::string error;
};

static CGImageRef OrientedImage(const std::vector<uint8_t> &bytes, int maxSide) {
  CFDataRef data = CFDataCreate(NULL, bytes.data(), (CFIndex)bytes.size());
  CGImageSourceRef source = CGImageSourceCreateWithData(data, NULL);

  CFRelease(data);

  if (!source) return NULL;

  NSDictionary *options = @{
    (id)kCGImageSourceCreateThumbnailFromImageAlways : @YES,
    (id)kCGImageSourceCreateThumbnailWithTransform : @YES,
    (id)kCGImageSourceThumbnailMaxPixelSize : @(maxSide),
  };
  CGImageRef image = CGImageSourceCreateThumbnailAtIndex(source, 0, (__bridge CFDictionaryRef)options);

  CFRelease(source);

  return image;
}

static uint8_t ToByte(float value) {
  if (value <= 0) return 0;

  if (value >= 1) return 255;

  return (uint8_t)(value * 255.0f + 0.5f);
}

static std::vector<uint8_t> MaskBytes(CVPixelBufferRef buffer, int *width, int *height) {
  CVPixelBufferLockBaseAddress(buffer, kCVPixelBufferLock_ReadOnly);

  size_t w = CVPixelBufferGetWidth(buffer);
  size_t h = CVPixelBufferGetHeight(buffer);
  size_t stride = CVPixelBufferGetBytesPerRow(buffer);
  const uint8_t *base = (const uint8_t *)CVPixelBufferGetBaseAddress(buffer);
  bool isFloat = CVPixelBufferGetPixelFormatType(buffer) == kCVPixelFormatType_OneComponent32Float;
  std::vector<uint8_t> out(w * h);

  for (size_t y = 0; y < h; y++) {
    const uint8_t *row = base + y * stride;

    for (size_t x = 0; x < w; x++) out[y * w + x] = isFloat ? ToByte(((const float *)row)[x]) : row[x];
  }

  CVPixelBufferUnlockBaseAddress(buffer, kCVPixelBufferLock_ReadOnly);
  *width = (int)w;
  *height = (int)h;

  return out;
}

API_AVAILABLE(macos(14.0))
static void RunVision(MaskJob *job) {
  CGImageRef image = OrientedImage(job->input, job->maxSide);

  if (!image) {
    job->error = "The image couldn't be read.";

    return;
  }

  VNGenerateForegroundInstanceMaskRequest *request = [VNGenerateForegroundInstanceMaskRequest new];
  VNImageRequestHandler *handler = [[VNImageRequestHandler alloc] initWithCGImage:image options:@{}];
  NSError *error = nil;

  CGImageRelease(image);

  if (![handler performRequests:@[ request ] error:&error]) {
    job->error = error.localizedDescription.UTF8String ?: "Vision failed.";

    return;
  }

  VNInstanceMaskObservation *observation = request.results.firstObject;

  if (!observation) return;

  [observation.allInstances enumerateIndexesUsingBlock:^(NSUInteger index, BOOL *stop) {
    NSError *maskError = nil;
    CVPixelBufferRef buffer = [observation generateScaledMaskForImageForInstances:[NSIndexSet indexSetWithIndex:index]
                                                               fromRequestHandler:handler
                                                                            error:&maskError];

    if (!buffer) return;

    job->instances.push_back(MaskBytes(buffer, &job->width, &job->height));
  }];
}

static bool VisionAvailable() {
  if (@available(macOS 14.0, *)) return true;

  return false;
}

static void Execute(napi_env env, void *data) {
  MaskJob *job = (MaskJob *)data;

  @autoreleasepool {
    if (@available(macOS 14.0, *)) {
      RunVision(job);
    } else {
      job->error = "Foreground masks need macOS 14 or later.";
    }
  }
}

static napi_value Result(napi_env env, MaskJob *job) {
  napi_value result, list, value;

  if (job->instances.empty()) {
    napi_get_null(env, &result);

    return result;
  }

  napi_create_object(env, &result);
  napi_create_int32(env, job->width, &value);
  napi_set_named_property(env, result, "width", value);
  napi_create_int32(env, job->height, &value);
  napi_set_named_property(env, result, "height", value);
  napi_create_array_with_length(env, job->instances.size(), &list);

  for (size_t i = 0; i < job->instances.size(); i++) {
    void *copy = NULL;

    napi_create_buffer_copy(env, job->instances[i].size(), job->instances[i].data(), &copy, &value);
    napi_set_element(env, list, (uint32_t)i, value);
  }

  napi_set_named_property(env, result, "instances", list);

  return result;
}

static void Complete(napi_env env, napi_status status, void *data) {
  MaskJob *job = (MaskJob *)data;

  if (job->error.empty()) {
    napi_resolve_deferred(env, job->deferred, Result(env, job));
  } else {
    napi_value message, error;

    napi_create_string_utf8(env, job->error.c_str(), NAPI_AUTO_LENGTH, &message);
    napi_create_error(env, NULL, message, &error);
    napi_reject_deferred(env, job->deferred, error);
  }

  napi_delete_async_work(env, job->work);
  delete job;
}

static napi_value ForegroundMasks(napi_env env, napi_callback_info info) {
  size_t argc = 2;
  napi_value argv[2], promise, name;
  bool isBuffer = false;
  void *bytes = NULL;
  size_t length = 0;
  int32_t maxSide = 1024;

  napi_get_cb_info(env, info, &argc, argv, NULL, NULL);

  if (argc < 1 || napi_is_buffer(env, argv[0], &isBuffer) != napi_ok || !isBuffer) {
    napi_throw_type_error(env, NULL, "foregroundMasks needs an image buffer");

    return NULL;
  }

  napi_get_buffer_info(env, argv[0], &bytes, &length);

  if (argc > 1) napi_get_value_int32(env, argv[1], &maxSide);

  MaskJob *job = new MaskJob();

  job->input.assign((uint8_t *)bytes, (uint8_t *)bytes + length);
  job->maxSide = maxSide > 64 ? maxSide : 1024;
  napi_create_promise(env, &job->deferred, &promise);
  napi_create_string_utf8(env, "foregroundMasks", NAPI_AUTO_LENGTH, &name);
  napi_create_async_work(env, NULL, name, Execute, Complete, job, &job->work);
  napi_queue_async_work(env, job->work);

  return promise;
}

static napi_value Init(napi_env env, napi_value exports) {
  napi_value fn, available;

  napi_create_function(env, "foregroundMasks", NAPI_AUTO_LENGTH, ForegroundMasks, NULL, &fn);
  napi_set_named_property(env, exports, "foregroundMasks", fn);
  napi_get_boolean(env, VisionAvailable(), &available);
  napi_set_named_property(env, exports, "available", available);

  return exports;
}

NAPI_MODULE(NODE_GYP_MODULE_NAME, Init)
