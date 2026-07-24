from __future__ import annotations

from django.db.models.signals import post_delete
from django.dispatch import receiver

from apps.cases.models import UploadedDocument


@receiver(post_delete, sender=UploadedDocument)
def delete_uploaded_file(sender, instance: UploadedDocument, **kwargs) -> None:
    if instance.file:
        instance.file.delete(save=False)