# SAM Model Directory

This directory contains the Segment Anything Model (SAM) weights for pixel-perfect segmentation.

## Model Not Included in Git

⚠️ **The model files are NOT included in the git repository** due to their large size (358MB+).

## Download Instructions

### Automatic Download

The model will be automatically downloaded on first use if not present, but you can pre-download it:

```bash
cd models
curl -L https://dl.fbaipublicfiles.com/segment_anything/sam_vit_b_01ec64.pth -o sam_vit_b_01ec64.pth
```

### Model Variants

| Model | Size | Speed | Quality | Download URL |
|-------|------|-------|---------|--------------|
| **vit_b** (recommended) | 358MB | Fast | ⭐⭐⭐⭐ | [Download](https://dl.fbaipublicfiles.com/segment_anything/sam_vit_b_01ec64.pth) |
| vit_l | 1.2GB | Medium | ⭐⭐⭐⭐⭐ | [Download](https://dl.fbaipublicfiles.com/segment_anything/sam_vit_l_0b3195.pth) |
| vit_h | 2.4GB | Slow | ⭐⭐⭐⭐⭐ | [Download](https://dl.fbaipublicfiles.com/segment_anything/sam_vit_h_4b8939.pth) |

## Verify Download

```bash
ls -lh models/
# Should show: sam_vit_b_01ec64.pth (358M)
```

## Usage

The SAM model is automatically loaded when you enable SAM in the API:

```json
{
    "use_sam": true
}
```

## More Information

- [SAM Official Repository](https://github.com/facebookresearch/segment-anything)
- [SAM Paper](https://arxiv.org/abs/2304.02643)
- See `SAM_INTEGRATION_COMPLETE.md` for integration details
